import { supabaseAdmin } from '@/lib/supabase'
import { makeSessionToken } from '@/lib/auth'
import { cookies } from 'next/headers'

const attempts = new Map<string, { count: number; lockedUntil: number }>()

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const entry = attempts.get(ip) ?? { count: 0, lockedUntil: 0 }

  if (entry.lockedUntil > now) {
    const secs = Math.ceil((entry.lockedUntil - now) / 1000)
    return Response.json({ error: `Te veel pogingen. Probeer over ${secs} seconden opnieuw.` }, { status: 429 })
  }

  const { password } = await request.json()
  if (!password) return Response.json({ error: 'Wachtwoord vereist' }, { status: 400 })

  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'portal_password')
    .single()

  const stored = data?.value ?? 'admin'

  if (password !== stored) {
    entry.count += 1
    if (entry.count >= 5) {
      entry.lockedUntil = now + 15 * 60 * 1000
      entry.count = 0
    }
    attempts.set(ip, entry)
    return Response.json({ error: 'Ongeldig wachtwoord' }, { status: 401 })
  }

  attempts.delete(ip)

  const token = makeSessionToken(stored)
  const cookieStore = await cookies()
  cookieStore.set('portaal_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  })

  return Response.json({ success: true })
}
