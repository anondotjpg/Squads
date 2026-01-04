import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side client with service role for admin operations
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url) {
    console.error('No Supabase URL found!')
    throw new Error('Missing Supabase URL')
  }
  
  if (serviceKey) {
    return createClient(url, serviceKey)
  }
  
  if (anonKey) {
    console.log('⚠️ Using anon key - add SUPABASE_SERVICE_ROLE_KEY for full access')
    return createClient(url, anonKey)
  }
  
  throw new Error('No Supabase key found')
}

export interface Token {
  id?: number
  token_mint: string
  name: string
  symbol: string
  description: string
  image_url?: string
  metadata_uri?: string
  bags_url: string
  signature?: string
  lifetime_fees_sol?: number
  // DAO fields
  dao_created?: boolean
  realm_address?: string
  governance_address?: string
  treasury_address?: string
  realms_url?: string
  dao_created_at?: string
  dao_signature?: string
  // Timestamps
  created_at?: string
  updated_at?: string
}

export async function saveToken(token: Omit<Token, 'id' | 'created_at' | 'updated_at'>): Promise<Token | null> {
  const client = getSupabaseAdmin()
  
  const { data, error } = await client
    .from('tokens')
    .insert([token])
    .select()
    .single()

  if (error) {
    console.error('Error saving token:', error)
    return null
  }

  return data
}

export async function getRecentTokens(limit = 20): Promise<Token[]> {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching tokens:', error)
    return []
  }

  return data || []
}

export async function updateTokenLifetimeFees(
  tokenMint: string, 
  lifetimeFeesSol: number
): Promise<boolean> {
  const client = getSupabaseAdmin()
  
  const { data, error } = await client
    .from('tokens')
    .update({ 
      lifetime_fees_sol: lifetimeFeesSol,
      updated_at: new Date().toISOString()
    })
    .eq('token_mint', tokenMint)
    .select()

  if (error) {
    console.error(`Error updating ${tokenMint}:`, error)
    return false
  }

  return (data && data.length > 0)
}

export async function updateTokenDAO(
  tokenMint: string,
  daoInfo: {
    realm_address: string
    governance_address?: string
    treasury_address?: string
    realms_url: string
    dao_signature?: string
  }
): Promise<boolean> {
  const client = getSupabaseAdmin()
  
  const { data, error } = await client
    .from('tokens')
    .update({
      dao_created: true,
      realm_address: daoInfo.realm_address,
      governance_address: daoInfo.governance_address,
      treasury_address: daoInfo.treasury_address,
      realms_url: daoInfo.realms_url,
      dao_signature: daoInfo.dao_signature,
      dao_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('token_mint', tokenMint)
    .select()

  if (error) {
    console.error(`Error updating DAO info for ${tokenMint}:`, error)
    return false
  }

  console.log(`✅ Updated DAO info for ${tokenMint}`)
  return (data && data.length > 0)
}

export async function bulkUpdateLifetimeFees(
  updates: { tokenMint: string; lifetimeFeesSol: number }[]
): Promise<{ success: number; failed: number }> {
  const client = getSupabaseAdmin()
  let success = 0
  let failed = 0

  for (const { tokenMint, lifetimeFeesSol } of updates) {
    const { data, error } = await client
      .from('tokens')
      .update({ 
        lifetime_fees_sol: lifetimeFeesSol,
        updated_at: new Date().toISOString()
      })
      .eq('token_mint', tokenMint)
      .select()
    
    if (error || !data || data.length === 0) {
      failed++
    } else {
      success++
    }
  }

  return { success, failed }
}

export async function getAllTokenMints(): Promise<string[]> {
  const client = getSupabaseAdmin()
  
  const { data, error } = await client
    .from('tokens')
    .select('token_mint')

  if (error) {
    console.error('Error fetching token mints:', error)
    return []
  }

  return data?.map(t => t.token_mint) || []
}

export async function getTokensNeedingDAO(threshold: number = 2.5): Promise<Token[]> {
  const client = getSupabaseAdmin()
  
  const { data, error } = await client
    .from('tokens')
    .select('*')
    .gte('lifetime_fees_sol', threshold)
    .or('dao_created.is.null,dao_created.eq.false')

  if (error) {
    console.error('Error fetching tokens needing DAO:', error)
    return []
  }

  return data || []
}

export async function getTokenByMint(tokenMint: string): Promise<Token | null> {
  const client = getSupabaseAdmin()
  
  const { data, error } = await client
    .from('tokens')
    .select('*')
    .eq('token_mint', tokenMint)
    .single()

  if (error) {
    console.error('Error fetching token:', error)
    return null
  }

  return data
}