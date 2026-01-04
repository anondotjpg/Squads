import { SplGovernance } from 'governance-idl-sdk'
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import bs58 from 'bs58'

// SPL Governance Program ID (mainnet)
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw')

// Bags tokens use 9 decimals
const TOKEN_DECIMALS = 9

// Min tokens to create proposal: 100,000 tokens
const MIN_TOKENS_TO_PROPOSE = 100_000
const MIN_TOKENS_RAW = BigInt(MIN_TOKENS_TO_PROPOSE) * BigInt(10 ** TOKEN_DECIMALS) // 100,000,000,000,000

// Estimated cost to create a DAO (from Realms docs)
// DAO Creation: ~2 SOL, Metadata: ~0.5 SOL, Treasury: ~0.2 SOL, Voter: ~0.1 SOL
const ESTIMATED_DAO_CREATION_COST_SOL = 2.5

export interface CreateRealmParams {
  tokenMint: string
  realmName: string
  tokenName: string
  tokenSymbol: string
}

export interface CreateRealmResult {
  success: boolean
  realmAddress?: string
  governanceAddress?: string
  nativeTreasuryAddress?: string
  realmsUrl?: string
  signature?: string
  error?: string
}

function getEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/**
 * Creates a Realms DAO with governance and native treasury for the given token
 */
export async function createRealmsDAO(params: CreateRealmParams): Promise<CreateRealmResult> {
  try {
    const rpcUrl = getEnvVar('SOLANA_RPC_URL')
    const privateKey = getEnvVar('PRIVATE_KEY')

    const connection = new Connection(rpcUrl, 'confirmed')
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey))
    
    // Initialize the governance SDK
    const splGovernance = new SplGovernance(connection, GOVERNANCE_PROGRAM_ID)
    
    const tokenMint = new PublicKey(params.tokenMint)
    const realmName = params.realmName || `${params.tokenSymbol} DAO`

    console.log(`🏛️ Creating Realms DAO: ${realmName}`)
    console.log(`   Token Mint: ${params.tokenMint}`)
    console.log(`   Estimated cost: ~${ESTIMATED_DAO_CREATION_COST_SOL} SOL`)

    // Check wallet balance
    const balance = await connection.getBalance(keypair.publicKey)
    const balanceSol = balance / LAMPORTS_PER_SOL
    console.log(`   Wallet balance: ${balanceSol.toFixed(4)} SOL`)
    
    if (balanceSol < ESTIMATED_DAO_CREATION_COST_SOL) {
      return {
        success: false,
        error: `Insufficient balance. Need ~${ESTIMATED_DAO_CREATION_COST_SOL} SOL, have ${balanceSol.toFixed(4)} SOL`,
      }
    }

    // Derive the realm address (PDA)
    const realmAddress = splGovernance.pda.realmAccount({ name: realmName }).publicKey
    console.log(`   Realm Address: ${realmAddress.toBase58()}`)

    // Check if realm already exists
    try {
      const existingRealm = await splGovernance.getRealmByPubkey(realmAddress)
      if (existingRealm) {
        console.log('⚠️ Realm already exists, deriving addresses...')
        
        // Derive governance address using token mint as seed
        const governanceAddress = splGovernance.pda.governanceAccount({
          realmAccount: realmAddress,
          seed: tokenMint,
        }).publicKey
        
        const nativeTreasuryAddress = splGovernance.pda.nativeTreasuryAccount({
          governanceAccount: governanceAddress,
        }).publicKey

        return {
          success: true,
          realmAddress: realmAddress.toBase58(),
          governanceAddress: governanceAddress.toBase58(),
          nativeTreasuryAddress: nativeTreasuryAddress.toBase58(),
          realmsUrl: `https://app.realms.today/dao/${realmAddress.toBase58()}`,
        }
      }
    } catch {
      // Realm doesn't exist, continue with creation
    }

    // Step 1: Create Realm
    console.log('   Creating realm...')
    const createRealmIx = await splGovernance.createRealmInstruction(
      realmName,
      tokenMint, // community token mint
      1, // min tokens to create governance (1 token = any holder can create)
      keypair.publicKey, // realm authority
      undefined, // no max vote weight source override
      undefined, // no council token
      'liquid', // community token type - liquid means transferable
      undefined // no council token config
    )

    // Build and send realm creation transaction
    const realmTx = new Transaction().add(createRealmIx)
    const { blockhash: realmBlockhash } = await connection.getLatestBlockhash('confirmed')
    realmTx.recentBlockhash = realmBlockhash
    realmTx.feePayer = keypair.publicKey

    const realmSignature = await sendAndConfirmTransaction(
      connection,
      realmTx,
      [keypair],
      { commitment: 'confirmed' }
    )
    console.log(`   ✅ Realm created! Signature: ${realmSignature}`)

    // Step 2: Create Governance (which creates the treasury PDA)
    console.log('   Creating governance...')
    console.log(`   Min tokens to propose: ${MIN_TOKENS_TO_PROPOSE} (${MIN_TOKENS_RAW} raw with ${TOKEN_DECIMALS} decimals)`)
    
    // Derive governance address using token mint as seed
    const governanceAddress = splGovernance.pda.governanceAccount({
      realmAccount: realmAddress,
      seed: tokenMint,
    }).publicKey
    console.log(`   Governance Address: ${governanceAddress.toBase58()}`)

    // Create governance instruction
    // Token holders vote with their tokens, 100k tokens needed to create proposal, 1 day voting
    const createGovernanceIx = await splGovernance.createGovernanceInstruction(
      realmAddress,
      tokenMint, // seed for governance (using token mint)
      {
        communityVoteThreshold: { type: 'yesVotePercentage', percentage: 60 }, // 60% to pass
        minCommunityTokensToCreateProposal: Number(MIN_TOKENS_RAW), // 100,000 tokens with 9 decimals
        minInstructionHoldUpTime: 0, // no hold up time
        baseVotingTime: 86400, // 1 day in seconds (24 * 60 * 60)
        communityVoteTipping: 'strict', // strict tipping
        councilVoteThreshold: { type: 'disabled' },
        councilVetoVoteThreshold: { type: 'disabled' },
        minCouncilTokensToCreateProposal: 0,
        councilVoteTipping: 'disabled',
        communityVetoVoteThreshold: { type: 'disabled' },
        votingCoolOffTime: 0,
        depositExemptProposalCount: 10,
      },
      keypair.publicKey, // payer
      keypair.publicKey, // governance authority (token owner record not needed for realm authority)
      undefined, // voter weight record
      undefined // max voter weight record
    )

    const governanceTx = new Transaction().add(createGovernanceIx)
    const { blockhash: govBlockhash } = await connection.getLatestBlockhash('confirmed')
    governanceTx.recentBlockhash = govBlockhash
    governanceTx.feePayer = keypair.publicKey

    const govSignature = await sendAndConfirmTransaction(
      connection,
      governanceTx,
      [keypair],
      { commitment: 'confirmed' }
    )
    console.log(`   ✅ Governance created! Signature: ${govSignature}`)

    // Step 3: Create Native Treasury
    console.log('   Creating native treasury...')
    
    const nativeTreasuryAddress = splGovernance.pda.nativeTreasuryAccount({
      governanceAccount: governanceAddress,
    }).publicKey
    console.log(`   Treasury Address: ${nativeTreasuryAddress.toBase58()}`)

    const createTreasuryIx = await splGovernance.createNativeTreasuryInstruction(
      governanceAddress,
      keypair.publicKey // payer
    )

    const treasuryTx = new Transaction().add(createTreasuryIx)
    const { blockhash: treasuryBlockhash } = await connection.getLatestBlockhash('confirmed')
    treasuryTx.recentBlockhash = treasuryBlockhash
    treasuryTx.feePayer = keypair.publicKey

    const treasurySignature = await sendAndConfirmTransaction(
      connection,
      treasuryTx,
      [keypair],
      { commitment: 'confirmed' }
    )
    console.log(`   ✅ Treasury created! Signature: ${treasurySignature}`)

    const realmsUrl = `https://app.realms.today/dao/${realmAddress.toBase58()}`
    console.log(`🔗 Realms URL: ${realmsUrl}`)

    return {
      success: true,
      realmAddress: realmAddress.toBase58(),
      governanceAddress: governanceAddress.toBase58(),
      nativeTreasuryAddress: nativeTreasuryAddress.toBase58(),
      realmsUrl,
      signature: realmSignature,
    }
  } catch (error) {
    console.error('Failed to create Realms DAO:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get the treasury address for an existing DAO
 */
export function getTreasuryAddress(
  realmAddress: string,
  tokenMint: string
): { governanceAddress: string; treasuryAddress: string } {
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed')
  const splGovernance = new SplGovernance(connection, GOVERNANCE_PROGRAM_ID)
  
  const realm = new PublicKey(realmAddress)
  const mint = new PublicKey(tokenMint)
  
  const governanceAddress = splGovernance.pda.governanceAccount({
    realmAccount: realm,
    seed: mint,
  }).publicKey
  
  const treasuryAddress = splGovernance.pda.nativeTreasuryAccount({
    governanceAccount: governanceAddress,
  }).publicKey
  
  return {
    governanceAddress: governanceAddress.toBase58(),
    treasuryAddress: treasuryAddress.toBase58(),
  }
}

/**
 * Send SOL to a DAO treasury
 */
export async function sendToTreasury(
  treasuryAddress: string,
  amountSol: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const rpcUrl = getEnvVar('SOLANA_RPC_URL')
    const privateKey = getEnvVar('PRIVATE_KEY')

    const connection = new Connection(rpcUrl, 'confirmed')
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey))
    
    const treasury = new PublicKey(treasuryAddress)
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL)

    console.log(`💸 Sending ${amountSol} SOL to treasury ${treasuryAddress}`)

    const transferIx = SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: treasury,
      lamports,
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

    console.log(`✅ Sent to treasury! Signature: ${signature}`)
    return { success: true, signature }
  } catch (error) {
    console.error('Failed to send to treasury:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}