import { supabaseAdmin } from '@/lib/supabase'
import { transporter } from '@/lib/mailer'

export async function POST(request: Request) {
  const { email } = await request.json()
  if (!email || typeof email !== 'string' || email.length > 254) {
    return Response.json({ error: 'email vereist' }, { status: 400 })
  }

  const lowerEmail = email.toLowerCase().trim()

  const { data: banned } = await supabaseAdmin
    .from('banned_emails').select('id').eq('email', lowerEmail).single()
  if (banned) return Response.json({ banned: true }, { status: 403 })

  // Server-side rate limit: max 1 code per 60 seconden per e-mail
  const { data: existing } = await supabaseAdmin
    .from('verification_codes').select('expires_at').eq('email', lowerEmail).single()
  if (existing) {
    const createdAt = new Date(existing.expires_at).getTime() - 10 * 60 * 1000
    if (Date.now() - createdAt < 60 * 1000) {
      return Response.json({ error: 'Wacht 60 seconden voordat u opnieuw een code aanvraagt.' }, { status: 429 })
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await supabaseAdmin.from('verification_codes').delete().eq('email', lowerEmail)

  const { error } = await supabaseAdmin.from('verification_codes').insert({
    email: lowerEmail, code, expires_at: expiresAt, used: false,
  })

  if (error) return Response.json({ error: 'Database fout' }, { status: 500 })

  try {
    await transporter.sendMail({
      from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Uw verificatiecode – MoSaidCuts',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
          <div style="background:#2d7a4f;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:24px;">✂ MoSaidCuts</h1>
          </div>
          <div style="background:#f9fafb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
            <h2 style="color:#111;margin-top:0;">Verificatiecode</h2>
            <p style="color:#555;">Gebruik de onderstaande code om uw afspraak te bevestigen. De code is <strong>10 minuten</strong> geldig.</p>
            <div style="background:#2d7a4f;color:#fff;font-size:36px;font-weight:800;letter-spacing:10px;padding:20px;text-align:center;border-radius:10px;margin:24px 0;">
              ${code}
            </div>
            <p style="color:#888;font-size:13px;">Als u geen afspraak heeft gemaakt bij MoSaidCuts, kunt u dit bericht negeren.</p>
          </div>
        </div>
      `,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[MoSaidCuts] Mail fout:', msg)
  }

  return Response.json({ success: true, emailSent: true })
}
