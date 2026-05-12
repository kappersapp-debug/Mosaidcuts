import { supabaseAdmin } from '@/lib/supabase'
import { makeSessionToken } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  if (!rateLimit(`login:${ip}`, 5, 15 * 60 * 1000)) {
    return Response.json({ error: 'Te veel pogingen, probeer het later opnieuw.' }, { status: 429 })
  }

  const { password } = await request.json()
  if (!password) return Response.json({ error: 'Wachtwoord vereist' }, { status: 400 })

  // Try bcrypt hash first
  const { data: hashRow } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'portal_password_hash')
    .single()

  if (hashRow?.value) {
    const valid = await bcrypt.compare(password, hashRow.value)
    if (!valid) return Response.json({ error: 'Ongeldig wachtwoord' }, { status: 401 })
  } else {
    // Migration: fall back to plain-text portal_password
    const { data: plainRow } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'portal_password')
      .single()

    const stored = plainRow?.value ?? 'admin'
    if (password !== stored) return Response.json({ error: 'Ongeldig wachtwoord' }, { status: 401 })

    // Migrate: hash and save, remove old row
    const hash = await bcrypt.hash(password, 12)
    await supabaseAdmin
      .from('settings')
      .upsert({ key: 'portal_password_hash', value: hash, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    await supabaseAdmin.from('settings').delete().eq('key', 'portal_password')
  }

  const token = makeSessionToken()
  const cookieStore = await cookies()
  cookieStore.set('portaal_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  return Response.json({ success: true })
}
