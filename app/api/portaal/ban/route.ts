import { verifyPortalAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { transporter } from '@/lib/mailer'

export async function GET() {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data } = await supabaseAdmin
    .from('banned_emails')
    .select('*')
    .order('banned_at', { ascending: false })

  return Response.json({ banned: data ?? [] })
}

export async function POST(request: Request) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { email, reason } = await request.json()
  if (!email) return Response.json({ error: 'email vereist' }, { status: 400 })

  const lowerEmail = email.toLowerCase()
  const today = new Date().toISOString().split('T')[0]

  const { error } = await supabaseAdmin.from('banned_emails').upsert({
    email: lowerEmail,
    reason: reason ?? '',
    banned_at: new Date().toISOString(),
  }, { onConflict: 'email' })

  if (error) return Response.json({ error: 'Fout bij bannen' }, { status: 500 })

  // Cancel all future bookings for this email
  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('id, code, name, service, date, time')
    .eq('email', lowerEmail)
    .gte('date', today)

  if (bookings && bookings.length > 0) {
    await supabaseAdmin.from('bookings').delete().eq('email', lowerEmail).gte('date', today)

    // Notify per cancelled booking (fire and forget)
    for (const b of bookings) {
      transporter.sendMail({
        from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
        to: lowerEmail,
        subject: `Afspraak geannuleerd – ${b.code}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
            <div style="background:#dc2626;padding:24px 32px;border-radius:12px 12px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:24px;">✂ MoSaidCuts</h1>
            </div>
            <div style="background:#f9fafb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
              <h2 style="color:#dc2626;margin-top:0;">Afspraak geannuleerd</h2>
              <p>Helaas is uw afspraak geannuleerd.</p>
              <div style="background:#fee2e2;border-radius:10px;padding:16px;margin:16px 0;">
                <p style="margin:4px 0;"><strong>Code:</strong> ${b.code}</p>
                <p style="margin:4px 0;"><strong>Dienst:</strong> ${b.service}</p>
                <p style="margin:4px 0;"><strong>Datum:</strong> ${b.date}</p>
                <p style="margin:4px 0;"><strong>Tijd:</strong> ${b.time}</p>
              </div>
            </div>
          </div>
        `,
      }).catch(() => {})
    }
  }

  return Response.json({ success: true, cancelledBookings: bookings?.length ?? 0 })
}

export async function DELETE(request: Request) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { email } = await request.json()
  if (!email) return Response.json({ error: 'email vereist' }, { status: 400 })

  await supabaseAdmin.from('banned_emails').delete().eq('email', email.toLowerCase())
  return Response.json({ success: true })
}
