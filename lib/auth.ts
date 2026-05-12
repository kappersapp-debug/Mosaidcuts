import { cookies } from 'next/headers'
import crypto from 'crypto'

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET environment variable is not set')
  return secret
}

function sign(sessionId: string): string {
  return crypto.createHmac('sha256', getSecret()).update(sessionId).digest('hex')
}

export function makeSessionToken(): string {
  const sessionId = crypto.randomBytes(32).toString('hex')
  return `${sessionId}.${sign(sessionId)}`
}

export async function verifyPortalAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get('portaal_session')?.value
  if (!token) return false

  const [sessionId, signature] = token.split('.')
  if (!sessionId || !signature) return false

  const expected = sign(sessionId)
  try {
    const a = Buffer.from(signature, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
