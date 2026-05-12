import { supabaseAdmin } from '@/lib/supabase'
import { transporter } from '@/lib/mailer'
import { rateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'

export async function POST(request: Request) {
  const { email } = await request.json()
  if (!email || typeof email !== 'string' || email.length > 254) {
    return Response.json({ error: 'email vereist' }, { status: 400 })
  }

  const lowerEmail = email.toLowerCase().trim()

  if (!rateLimit(`verify-send:${lowerEmail}`, 3, 10 * 60 * 1000)) {
    return Response.json({ error: 'Te veel pogingen, probeer het later opnieuw.' }, { status: 429 })
  }

  const { data: banned } = await supabaseAdmin
    .from('banned_emails').select('id').eq('email', lowerEmail).single()
  if (banned) return Response.json({ banned: true }, { status: 403 })

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const codeHash = crypto.createHash('sha256').update(code).digest('hex')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await supabaseAdmin.from('verification_codes').delete().eq('email', lowerEmail)

  const { error } = await supabaseAdmin.from('verification_codes').insert({
    email: lowerEmail, code: codeHash, expires_at: expiresAt, used: false,
  })

  if (error) return Response.json({ error: 'Database fout' }, { status: 500 })

  try {
    await transporter.sendMail({
      from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Uw verificatiecode – MoSaidCuts',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
          <div style="background:#1d4ed8;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:24px;">✂ MoSaidCuts</h1>
          </div>
          <div style="background:#f9fafb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
            <h2 style="color:#111;margin-top:0;">Verificatiecode</h2>
            <p style="color:#555;">Gebruik de onderstaande code om uw afspraak te bevestigen. De code is <strong>10 minuten</strong> geldig.</p>
            <div style="background:#1d4ed8;color:#fff;font-size:36px;font-weight:800;letter-spacing:10px;padding:20px;text-align:center;border-radius:10px;margin:24px 0;">
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
