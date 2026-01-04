import {
  BagsSDK,
  signAndSendTransaction,
  createTipTransaction,
  sendBundleAndConfirm,
} from '@bagsfm/bags-sdk'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import { saveToken } from './supabase'

const FALLBACK_JITO_TIP_LAMPORTS = 0.015 * LAMPORTS_PER_SOL
const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1'

export interface TokenLaunchParams {
  name: string
  symbol: string
  description: string
  imageBuffer: Buffer
  imageMimeType: string
  twitterUrl?: string
  websiteUrl?: string
  telegramUrl?: string
  initialBuyAmountSol: number
}

export interface LaunchResult {
  success: boolean
  tokenMint?: string
  signature?: string
  metadataUri?: string
  bagsUrl?: string
  error?: string
}

interface TokenInfoResponse {
  tokenMint: string
  tokenMetadata: string
  imageUrl?: string
}

function getEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

async function sendBundleWithTip(
  sdk: BagsSDK,
  unsignedTransactions: VersionedTransaction[],
  keypair: Keypair
): Promise<string> {
  const commitment = sdk.state.getCommitment()
  const bundleBlockhash = unsignedTransactions[0]?.message.recentBlockhash

  if (!bundleBlockhash) {
    throw new Error('Bundle transactions must have a blockhash')
  }

  let jitoTip = FALLBACK_JITO_TIP_LAMPORTS

  const recommendedJitoTip = await sdk.solana
    .getJitoRecentFees()
    .catch(() => null)

  if (recommendedJitoTip?.landed_tips_95th_percentile) {
    jitoTip = Math.floor(
      recommendedJitoTip.landed_tips_95th_percentile * LAMPORTS_PER_SOL
    )
  }

  const connection = new Connection(getEnvVar('SOLANA_RPC_URL'))
  const tipTransaction = await createTipTransaction(
    connection,
    commitment,
    keypair.publicKey,
    jitoTip,
    { blockhash: bundleBlockhash }
  )

  const signedTransactions = [tipTransaction, ...unsignedTransactions].map(
    (tx) => {
      tx.sign([keypair])
      return tx
    }
  )

  const bundleId = await sendBundleAndConfirm(signedTransactions, sdk)
  return bundleId
}

async function createFeeShareConfig(
  sdk: BagsSDK,
  connection: Connection,
  tokenMint: PublicKey,
  creatorWallet: PublicKey,
  keypair: Keypair
): Promise<PublicKey> {
  const commitment = sdk.state.getCommitment()

  // Creator gets 100% of fees
  const feeClaimers = [{ user: creatorWallet, userBps: 10000 }]

  const configResult = await sdk.config.createBagsFeeShareConfig({
    payer: creatorWallet,
    baseMint: tokenMint,
    feeClaimers,
  })

  if (configResult.bundles) {
    for (const bundle of configResult.bundles) {
      await sendBundleWithTip(sdk, bundle, keypair)
    }
  }

  for (const tx of configResult.transactions || []) {
    await signAndSendTransaction(connection, commitment, tx, keypair)
  }

  return configResult.meteoraConfigKey
}

/**
 * Upload image and create token metadata via Bags API
 * Uses multipart/form-data as per Bags documentation
 */
async function createTokenInfoWithUpload(
  apiKey: string,
  params: {
    name: string
    symbol: string
    description?: string
    imageBuffer: Buffer
    imageMimeType: string
    twitter?: string
    website?: string
    telegram?: string
  }
): Promise<TokenInfoResponse> {
  // Determine file extension from mime type
  const extMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }
  const ext = extMap[params.imageMimeType] || 'png'

  // Build multipart form data
  const formData = new FormData()

  // Create a Blob from the buffer for the image field
  const imageBlob = new Blob([new Uint8Array(params.imageBuffer)], { type: params.imageMimeType })
  formData.append('image', imageBlob, `token-image.${ext}`)

  // Append other fields
  formData.append('name', params.name)
  formData.append('symbol', params.symbol)

  if (params.description) {
    formData.append('description', params.description)
  }
  if (params.twitter) {
    formData.append('twitter', params.twitter)
  }
  if (params.website) {
    formData.append('website', params.website)
  }
  if (params.telegram) {
    formData.append('telegram', params.telegram)
  }

  const response = await fetch(
    `${BAGS_API_BASE}/token-launch/create-token-info`,
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
      },
      body: formData,
    }
  )

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Failed to create token info: ${response.status} - ${errorBody}`)
  }

  const data = await response.json()
  console.log('Bags API response:', JSON.stringify(data, null, 2))

  // Bags API wraps responses in { success: true, response: {...} }
  const result = data.response || data

  if (!result.tokenMint && !result.mint) {
    throw new Error(`Invalid response from create-token-info endpoint: ${JSON.stringify(data)}`)
  }

  const metadataUrl = result.tokenMetadata || result.metadataUrl || result.metadata

  return {
    tokenMint: result.tokenMint || result.mint,
    tokenMetadata: metadataUrl,
  }
}

export async function launchToken(
  params: TokenLaunchParams
): Promise<LaunchResult> {
  try {
    const apiKey = getEnvVar('BAGS_API_KEY')
    const rpcUrl = getEnvVar('SOLANA_RPC_URL')
    const privateKey = getEnvVar('PRIVATE_KEY')

    const connection = new Connection(rpcUrl)
    const sdk = new BagsSDK(apiKey, connection, 'processed')
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey))
    const commitment = sdk.state.getCommitment()

    // 1. Create metadata with image upload
    const tokenInfo = await createTokenInfoWithUpload(apiKey, {
      imageBuffer: params.imageBuffer,
      imageMimeType: params.imageMimeType,
      name: params.name,
      description: params.description,
      symbol: params.symbol.replace('$', '').toUpperCase(),
      twitter: params.twitterUrl,
      website: params.websiteUrl,
      telegram: params.telegramUrl,
    })

    const tokenMint = new PublicKey(tokenInfo.tokenMint)

    // 2. Fee config (100% to creator)
    const configKey = await createFeeShareConfig(
      sdk,
      connection,
      tokenMint,
      keypair.publicKey,
      keypair
    )

    // 3. Launch tx
    const launchTx = await sdk.tokenLaunch.createLaunchTransaction({
      metadataUrl: tokenInfo.tokenMetadata,
      tokenMint,
      launchWallet: keypair.publicKey,
      initialBuyLamports: params.initialBuyAmountSol * LAMPORTS_PER_SOL,
      configKey,
    })

    // 4. Send
    const signature = await signAndSendTransaction(
      connection,
      commitment,
      launchTx,
      keypair
    )

    const bagsUrl = `https://bags.fm/${tokenInfo.tokenMint}`

    // 5. Save to Supabase
    await saveToken({
      token_mint: tokenInfo.tokenMint,
      name: params.name,
      symbol: params.symbol.replace('$', '').toUpperCase(),
      description: params.description,
      metadata_uri: tokenInfo.tokenMetadata,
      bags_url: bagsUrl,
      signature,
    })

    return {
      success: true,
      tokenMint: tokenInfo.tokenMint,
      signature,
      metadataUri: tokenInfo.tokenMetadata,
      bagsUrl,
    }
  } catch (error) {
    console.error('Token launch failed:', error)
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error occurred',
    }
  }
}