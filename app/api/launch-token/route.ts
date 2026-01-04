import { NextRequest, NextResponse } from 'next/server'
import { launchToken, type TokenLaunchParams } from './lib/bags'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]

interface ValidatedData {
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

async function validateFormData(
  formData: FormData
): Promise<{ valid: true; data: ValidatedData } | { valid: false; error: string }> {
  // Validate image file
  const imageFile = formData.get('image')
  if (!imageFile || !(imageFile instanceof File)) {
    return { valid: false, error: 'Image file is required' }
  }

  if (imageFile.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Image file must be under 15MB' }
  }

  if (!ALLOWED_MIME_TYPES.includes(imageFile.type)) {
    return {
      valid: false,
      error: 'Unsupported file type. Please upload PNG, JPG, JPEG, GIF, or WebP images.',
    }
  }

  // Convert file to buffer
  const arrayBuffer = await imageFile.arrayBuffer()
  const imageBuffer = Buffer.from(arrayBuffer)

  // Validate required text fields
  const name = formData.get('name')
  if (!name || typeof name !== 'string' || !name.trim()) {
    return { valid: false, error: 'Token name is required' }
  }

  const symbol = formData.get('symbol')
  if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
    return { valid: false, error: 'Token symbol is required' }
  }

  if (symbol.length > 10) {
    return {
      valid: false,
      error: 'Token symbol must be 10 characters or less',
    }
  }

  const description = formData.get('description')
  if (!description || typeof description !== 'string' || !description.trim()) {
    return { valid: false, error: 'Token description is required' }
  }

  // Validate initial buy amount
  const initialBuyStr = formData.get('initialBuyAmountSol')
  const initialBuy = Number(initialBuyStr)
  if (isNaN(initialBuy) || initialBuy < 0) {
    return {
      valid: false,
      error: 'Initial buy amount must be a positive number',
    }
  }

  // Optional fields
  const twitterUrl = formData.get('twitterUrl')
  const websiteUrl = formData.get('websiteUrl')
  const telegramUrl = formData.get('telegramUrl')

  return {
    valid: true,
    data: {
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      description: description.trim(),
      imageBuffer,
      imageMimeType: imageFile.type,
      twitterUrl: twitterUrl && typeof twitterUrl === 'string' ? twitterUrl : undefined,
      websiteUrl: websiteUrl && typeof websiteUrl === 'string' ? websiteUrl : undefined,
      telegramUrl: telegramUrl && typeof telegramUrl === 'string' ? telegramUrl : undefined,
      initialBuyAmountSol: initialBuy,
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check environment variables
    const requiredEnvVars = ['BAGS_API_KEY', 'SOLANA_RPC_URL', 'PRIVATE_KEY']
    const missingVars = requiredEnvVars.filter((v) => !process.env[v])

    if (missingVars.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing env vars: ${missingVars.join(', ')}`,
        },
        { status: 500 }
      )
    }

    // Parse multipart form data
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid form data. Expected multipart/form-data.' },
        { status: 400 }
      )
    }

    // Validate form data
    const validation = await validateFormData(formData)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      )
    }

    // Launch token
    const result = await launchToken(validation.data as TokenLaunchParams)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        tokenMint: result.tokenMint,
        signature: result.signature,
        metadataUri: result.metadataUri,
        bagsUrl: result.bagsUrl,
      },
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Bags Token Launch API',
    version: 'v2',
    usage: {
      method: 'POST',
      contentType: 'multipart/form-data',
      fields: {
        image: 'File (required) - PNG, JPG, JPEG, GIF, or WebP, max 15MB',
        name: 'string (required) - Token name',
        symbol: 'string (required) - Token symbol, max 10 chars',
        description: 'string (required) - Token description',
        initialBuyAmountSol: 'number (required) - Initial buy amount in SOL',
        twitterUrl: 'string (optional)',
        websiteUrl: 'string (optional)',
        telegramUrl: 'string (optional)',
      },
    },
  })
}