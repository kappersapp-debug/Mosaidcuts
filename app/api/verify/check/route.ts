import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  const { email, code } = await request.json()
  if (!email || !code) return Response.json({ error: 'email en code vereist' }, { status: 400 })

  const { data } = await supabaseAdmin
    .from('verification_codes')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('code', code)
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
