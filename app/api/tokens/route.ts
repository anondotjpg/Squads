import { NextResponse } from 'next/server'
import { getRecentTokens } from '../launch-token/lib/supabase'

export const runtime = 'nodejs'
export const revalidate = 30 // Revalidate every 30 seconds

export async function GET() {
  try {
    const tokens = await getRecentTokens(50)

    return NextResponse.json({
      success: true,
      data: tokens,
    })
  } catch (error) {
    console.error('Error fetching tokens:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tokens',
      },
      { status: 500 }
    )
  }
}