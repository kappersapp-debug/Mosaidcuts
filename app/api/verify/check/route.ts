export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'

export async function POST(request: Request) {
  const { email, code } = await request.json()
  if (!email || !code) return Response.json({ error: 'email en code vereist' }, { status: 400 })

  const lowerEmail = email.toLowerCase()

  if (!rateLimit(`verify-check:${lowerEmail}`, 5, 10 * 60 * 1000)) {
    return Response.json({ error: 'Te veel pogingen, probeer het later opnieuw.' }, { status: 429 })
  }

  const codeHash = crypto.createHash('sha256').update(String(code)).digest('hex')

  const { data } = await supabaseAdmin
    .from('verification_codes')
    .select('*')
    .eq('email', lowerEmail)
    .eq('code', codeHash)
    .eq('used', false)
    .single()

  if (!data) return Response.json({ valid: false, error: 'Ongeldige code' }, { status: 400 })

  if (new Date(data.expires_at) < new Date()) {
    return Response.json({ valid: false, error: 'Code is verlopen' }, { status: 400 })
  }

  // Mark as used
  await supabaseAdmin
    .from('verification_codes')
    .update({ used: true })
    .eq('id', data.id)

  return Response.json({ valid: true })
}
