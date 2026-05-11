import { cookies } from 'next/headers'
import crypto from 'crypto'
import { supabaseAdmin } from './supabase'

function makeToken(password: string): string {
  return crypto
    .createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(password)
    .digest('hex')
}

export async function verifyPortalAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get('portaal_session')?.value
  if (!token) return false

  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'portal_password')
    .single()

  const password = data?.value ?? 'admin'
  return token === makeToken(password)
}

export function makeSessionToken(password: string): string {
  return makeToken(password)
}
