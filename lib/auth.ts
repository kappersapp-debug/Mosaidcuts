import { cookies } from 'next/headers'
import crypto from 'crypto'

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET environment variable is not set')
  return secret
}

function makeSessionToken(): string {
  return crypto
    .createHmac('sha256', getSecret())
    .update('authenticated')
    .digest('hex')
}

export async function verifyPortalAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get('portaal_session')?.value
  if (!token) return false
  return token === makeSessionToken()
}

export { makeSessionToken }
