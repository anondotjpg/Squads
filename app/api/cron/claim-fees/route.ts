import { NextRequest, NextResponse } from 'next/server'
import { BagsSDK } from '@bagsfm/bags-sdk'
import { 
  Keypair, 
  Connection, 
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram
} from '@solana/web3.js'
import bs58 from 'bs58'
import { 
  bulkUpdateLifetimeFees, 
  getAllTokenMints, 
  getTokensNeedingDAO,
  updateTokenDAO,
  getTokenByMint
} from '../../launch-token/lib/supabase'
import { createRealmsDAO, sendToTreasury } from '../../launch-token/lib/realms'

export const runtime = 'nodejs'
export const maxDuration = 300

const MIN_LIFETIME_FEES_SOL = 2.5

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (!cronSecret) return true
  return authHeader === `Bearer ${cronSecret}`
}

async function getClaimedAmount(
  connection: Connection, 
  signature: string, 
  wallet: string
): Promise<number> {
  try {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    })
    
    if (!tx?.meta) return 0
    
    const accountKeys = tx.transaction.message.getAccountKeys()
    const walletIndex = accountKeys.staticAccountKeys.findIndex(
      key => key.toBase58() === wallet
    )
    
    if (walletIndex === -1) return 0
    
    const preBalance = tx.meta.preBalances[walletIndex]
    const postBalance = tx.meta.postBalances[walletIndex]
    const fee = tx.meta.fee
    
    const claimed = (postBalance - preBalance + fee) / LAMPORTS_PER_SOL
    return Math.max(0, claimed)
  } catch {
    return 0
  }
}

async function fetchLifetimeFeesForTokens(
  sdk: BagsSDK,
  tokenMints: string[]
): Promise<Map<string, number>> {
  const lifetimeFees: Map<string, number> = new Map()
  const BATCH_SIZE = 10

  for (let i = 0; i < tokenMints.length; i += BATCH_SIZE) {
    const batch = tokenMints.slice(i, i + BATCH_SIZE)
    
    const promises = batch.map(async (mint) => {
      try {
        const feesLamports = await sdk.state.getTokenLifetimeFees(new PublicKey(mint))
        return { mint, fees: feesLamports / LAMPORTS_PER_SOL }
      } catch (e) {
        console.error(`Failed to get fees for ${mint}:`, e)
        return { mint, fees: 0 }
      }
    })

    const results = await Promise.all(promises)
    results.forEach(({ mint, fees }) => lifetimeFees.set(mint, fees))
  }

  return lifetimeFees
}

async function createDAOsForEligibleTokens(): Promise<{
  created: number
  failed: number
  details: { tokenMint: string; success: boolean; realmAddress?: string; treasuryAddress?: string; error?: string }[]
}> {
  const tokensNeedingDAO = await getTokensNeedingDAO(MIN_LIFETIME_FEES_SOL)
  const details: { tokenMint: string; success: boolean; realmAddress?: string; treasuryAddress?: string; error?: string }[] = []
  let created = 0
  let failed = 0

  console.log(`🏛️ Found ${tokensNeedingDAO.length} tokens eligible for DAO creation`)

  for (const token of tokensNeedingDAO) {
    try {
      console.log(`Creating DAO for ${token.symbol} (${token.token_mint})...`)
      
      const result = await createRealmsDAO({
        tokenMint: token.token_mint,
        realmName: `${token.symbol} DAO`,
        tokenName: token.name,
        tokenSymbol: token.symbol,
      })

      if (result.success && result.realmAddress) {
        // Update database with DAO info including treasury
        await updateTokenDAO(token.token_mint, {
          realm_address: result.realmAddress,
          governance_address: result.governanceAddress,
          treasury_address: result.nativeTreasuryAddress,
          realms_url: result.realmsUrl!,
          dao_signature: result.signature,
        })

        created++
        details.push({
          tokenMint: token.token_mint,
          success: true,
          realmAddress: result.realmAddress,
          treasuryAddress: result.nativeTreasuryAddress,
        })
        console.log(`✅ DAO created for ${token.symbol}: ${result.realmsUrl}`)
        console.log(`   Treasury: ${result.nativeTreasuryAddress}`)
      } else {
        failed++
        details.push({
          tokenMint: token.token_mint,
          success: false,
          error: result.error,
        })
        console.error(`❌ Failed to create DAO for ${token.symbol}: ${result.error}`)
      }
    } catch (error) {
      failed++
      details.push({
        tokenMint: token.token_mint,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      console.error(`❌ Error creating DAO for ${token.symbol}:`, error)
    }
  }

  return { created, failed, details }
}

async function sendClaimedFeesToTreasury(
  connection: Connection,
  keypair: Keypair,
  tokenMint: string,
  claimedSol: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  if (claimedSol <= 0) {
    return { success: false, error: 'No fees to send' }
  }

  // Get token info from DB to find treasury
  const token = await getTokenByMint(tokenMint)
  
  if (!token?.dao_created || !token?.treasury_address) {
    console.log(`   No treasury for ${tokenMint}, keeping fees in wallet`)
    return { success: false, error: 'No treasury address' }
  }

  try {
    const treasury = new PublicKey(token.treasury_address)
    const lamports = Math.floor(claimedSol * LAMPORTS_PER_SOL)

    // Keep a small amount for tx fees (0.001 SOL)
    const keepForFees = 0.001 * LAMPORTS_PER_SOL
    const sendLamports = Math.max(0, lamports - keepForFees)

    if (sendLamports <= 0) {
      return { success: false, error: 'Amount too small after fees' }
    }

    console.log(`   💸 Sending ${(sendLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL to treasury ${token.treasury_address}`)

    const transferIx = SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: treasury,
      lamports: sendLamports,
    })

    const tx = new Transaction().add(transferIx)
    const { blockhash } = await connection.getLatestBlockhash('confirmed')
    tx.recentBlockhash = blockhash
    tx.feePayer = keypair.publicKey

    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [keypair],
      { commitment: 'confirmed' }
    )

    console.log(`   ✅ Sent to treasury! Signature: ${signature}`)
    return { success: true, signature }
  } catch (error) {
    console.error(`   ❌ Failed to send to treasury:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.BAGS_API_KEY
  const rpcUrl = process.env.SOLANA_RPC_URL
  const privateKey = process.env.PRIVATE_KEY

  if (!apiKey || !rpcUrl || !privateKey) {
    return NextResponse.json(
      { error: 'Missing required environment variables' },
      { status: 500 }
    )
  }

  try {
    const connection = new Connection(rpcUrl, 'confirmed')
    const sdk = new BagsSDK(apiKey, connection, 'confirmed')
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey))
    const walletAddress = keypair.publicKey.toBase58()

    console.log(`💰 Claiming fees for wallet: ${walletAddress}`)

    // Get claimable positions first
    const allPositions = await sdk.fee.getAllClaimablePositions(keypair.publicKey)
    console.log(`Found ${allPositions.length} claimable position(s)`)

    // Get tokens from DB
    const dbTokenMints = await getAllTokenMints()
    console.log(`📋 Found ${dbTokenMints.length} tokens in database`)

    // Combine: DB tokens + claimable position tokens
    const positionMints = allPositions.map(p => p.baseMint)
    const allTokenMints = [...new Set([...dbTokenMints, ...positionMints])]
    console.log(`📊 Total unique tokens to check: ${allTokenMints.length}`)

    // Fetch lifetime fees for ALL tokens
    let lifetimeFees: Map<string, number> = new Map()
    let dbUpdateResult = { success: 0, failed: 0 }

    if (allTokenMints.length > 0) {
      console.log(`📊 Fetching lifetime fees for ${allTokenMints.length} tokens...`)
      lifetimeFees = await fetchLifetimeFeesForTokens(sdk, allTokenMints)
      console.log(`Got fees for ${lifetimeFees.size} tokens`)

      // Update DB - only for tokens that exist in DB
      if (dbTokenMints.length > 0) {
        const updates = dbTokenMints
          .filter(mint => lifetimeFees.has(mint))
          .map(mint => ({
            tokenMint: mint,
            lifetimeFeesSol: parseFloat((lifetimeFees.get(mint) || 0).toFixed(6))
          }))

        if (updates.length > 0) {
          dbUpdateResult = await bulkUpdateLifetimeFees(updates)
          console.log(`✅ Updated lifetime fees: ${dbUpdateResult.success} success, ${dbUpdateResult.failed} failed`)
        }
      }
    }

    // CREATE DAOs for tokens that have reached threshold
    console.log(`\n🏛️ Checking for tokens eligible for DAO creation...`)
    const daoResult = await createDAOsForEligibleTokens()
    console.log(`🏛️ DAO creation: ${daoResult.created} created, ${daoResult.failed} failed`)

    if (allPositions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No claimable positions found',
        totalClaimedSol: 0,
        totalSentToTreasury: 0,
        positions: [],
        dbTokensFound: dbTokenMints.length,
        lifetimeFeesUpdated: dbUpdateResult.success,
        daosCreated: daoResult.created,
        daosFailed: daoResult.failed,
        daoDetails: daoResult.details,
        lifetimeFeesData: Object.fromEntries(lifetimeFees)
      })
    }

    // Filter positions by lifetime fees threshold
    const eligiblePositions = allPositions.filter(p => {
      const fees = lifetimeFees.get(p.baseMint) || 0
      return fees >= MIN_LIFETIME_FEES_SOL
    })

    const skippedPositions = allPositions.filter(p => {
      const fees = lifetimeFees.get(p.baseMint) || 0
      return fees < MIN_LIFETIME_FEES_SOL
    })

    console.log(`${eligiblePositions.length} positions meet threshold (>=${MIN_LIFETIME_FEES_SOL} SOL)`)
    console.log(`${skippedPositions.length} positions skipped (below threshold)`)

    if (eligiblePositions.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No positions meet threshold (${MIN_LIFETIME_FEES_SOL} SOL), but lifetime fees updated`,
        totalClaimedSol: 0,
        totalSentToTreasury: 0,
        positionsClaimed: 0,
        positionsSkipped: skippedPositions.length,
        dbTokensFound: dbTokenMints.length,
        lifetimeFeesUpdated: dbUpdateResult.success,
        daosCreated: daoResult.created,
        daosFailed: daoResult.failed,
        daoDetails: daoResult.details,
        skipped: skippedPositions.map(p => ({
          tokenMint: p.baseMint,
          lifetimeFeesSol: lifetimeFees.get(p.baseMint) || 0
        }))
      })
    }

    // Collect transactions for eligible positions
    const allTxs: { tokenMint: string; tx: Transaction; lifetimeFees: number }[] = []
    
    for (const position of eligiblePositions) {
      try {
        const claimTransactions = await sdk.fee.getClaimTransaction(
          keypair.publicKey,
          position
        )
        
        if (claimTransactions && claimTransactions.length > 0) {
          for (const tx of claimTransactions) {
            allTxs.push({ 
              tokenMint: position.baseMint, 
              tx: tx as Transaction,
              lifetimeFees: lifetimeFees.get(position.baseMint) || 0
            })
          }
        }
      } catch (e) {
        console.error(`Failed to get tx for ${position.baseMint}:`, e)
      }
    }

    console.log(`Sending ${allTxs.length} claim transactions...`)

    // Send transactions in parallel batches
    const TX_BATCH_SIZE = 5
    const results: {
      tokenMint: string
      success: boolean
      lifetimeFeesSol: number
      claimedSol?: number
      signature?: string
      sentToTreasury?: boolean
      treasurySignature?: string
      error?: string
    }[] = []

    let totalSentToTreasury = 0

    for (let i = 0; i < allTxs.length; i += TX_BATCH_SIZE) {
      const batch = allTxs.slice(i, i + TX_BATCH_SIZE)
      
      const { blockhash } = await connection.getLatestBlockhash('confirmed')
      
      const batchPromises = batch.map(async ({ tokenMint, tx, lifetimeFees }) => {
        try {
          tx.recentBlockhash = blockhash
          tx.feePayer = keypair.publicKey
          
          const signature = await sendAndConfirmTransaction(
            connection,
            tx,
            [keypair],
            { commitment: 'confirmed' }
          )
          
          const claimedSol = await getClaimedAmount(connection, signature, walletAddress)
          
          // Send claimed fees to DAO treasury
          let sentToTreasury = false
          let treasurySignature: string | undefined

          if (claimedSol > 0) {
            const treasuryResult = await sendClaimedFeesToTreasury(
              connection,
              keypair,
              tokenMint,
              claimedSol
            )
            if (treasuryResult.success) {
              sentToTreasury = true
              treasurySignature = treasuryResult.signature
              totalSentToTreasury += claimedSol
            }
          }
          
          return { 
            tokenMint, 
            success: true, 
            signature, 
            claimedSol, 
            lifetimeFeesSol: lifetimeFees,
            sentToTreasury,
            treasurySignature
          }
        } catch (error) {
          return { 
            tokenMint, 
            success: false, 
            lifetimeFeesSol: lifetimeFees,
            error: error instanceof Error ? error.message : 'Unknown error' 
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
      
      console.log(`Batch ${Math.floor(i / TX_BATCH_SIZE) + 1} complete`)
    }

    const successCount = results.filter(r => r.success).length
    const totalClaimedSol = results.reduce((sum, r) => sum + (r.claimedSol || 0), 0)
    const treasuryTransfers = results.filter(r => r.sentToTreasury).length

    console.log(`🎉 Claimed ${totalClaimedSol.toFixed(6)} SOL from ${successCount}/${results.length} txs`)
    console.log(`💸 Sent ${totalSentToTreasury.toFixed(6)} SOL to treasuries (${treasuryTransfers} transfers)`)

    return NextResponse.json({
      success: true,
      message: `Claimed fees from ${successCount}/${results.length} transactions`,
      totalClaimedSol: parseFloat(totalClaimedSol.toFixed(6)),
      totalSentToTreasury: parseFloat(totalSentToTreasury.toFixed(6)),
      treasuryTransfers,
      totalTransactions: results.length,
      successfulTransactions: successCount,
      minLifetimeFeesSol: MIN_LIFETIME_FEES_SOL,
      positionsSkipped: skippedPositions.length,
      dbTokensFound: dbTokenMints.length,
      lifetimeFeesUpdated: dbUpdateResult.success,
      daosCreated: daoResult.created,
      daosFailed: daoResult.failed,
      daoDetails: daoResult.details,
      positions: results,
      skipped: skippedPositions.map(p => ({
        tokenMint: p.baseMint,
        lifetimeFeesSol: parseFloat((lifetimeFees.get(p.baseMint) || 0).toFixed(6))
      }))
    })
  } catch (error) {
    console.error('Fee claiming cron error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}