import { supabaseAdmin } from '@/lib/supabase'
import { transporter } from '@/lib/mailer'

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const NL_DAYS = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag']
const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

function formatDateNL(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${NL_DAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Tomorrow's date (UTC — cron runs at 07:00 UTC = 09:00 NL time, so UTC+1 day = NL+1 day)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('date', tomorrowStr)

  if (!bookings || bookings.length === 0) {
    return Response.json({ sent: 0 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  let sent = 0

  for (const booking of bookings) {
    if (!booking.email) continue
    const cancelUrl = `${baseUrl}/?annuleer=${booking.code}`
    try {
      await transporter.sendMail({
        from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
        to: booking.email,
        subject: `Herinnering: uw afspraak morgen – ${booking.code}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
            <div style="background:#1d4ed8;padding:24px 32px;border-radius:12px 12px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:24px;">✂ MoSaidCuts</h1>
            </div>
            <div style="background:#f9fafb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
              <h2 style="color:#1d4ed8;margin-top:0;">Herinnering afspraak morgen</h2>
              <p>Hallo <strong>${esc(booking.name)}</strong>, dit is een herinnering voor uw afspraak van morgen.</p>
              <div style="background:#dbeafe;border-radius:10px;padding:20px;margin:20px 0;">
                <p style="margin:6px 0;"><strong>Boekingscode:</strong> <span style="font-size:18px;font-weight:800;color:#1d4ed8;">${booking.code}</span></p>
                <p style="margin:6px 0;"><strong>Dienst:</strong> ${esc(booking.service)}</p>
                <p style="margin:6px 0;"><strong>Datum:</strong> ${formatDateNL(booking.date)}</p>
                <p style="margin:6px 0;"><strong>Tijd:</strong> ${booking.time}</p>
                <p style="margin:6px 0;"><strong>Prijs:</strong> €${booking.price}</p>
              </div>
              <p style="color:#555;">Kunt u niet komen? Annuleer dan zo snel mogelijk via de knop hieronder.</p>
              <div style="text-align:center;margin:24px 0;">
                <a href="${cancelUrl}"
                  style="display:inline-block;background:#dc2626;color:#fff;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:15px;">
                  Afspraak annuleren
                </a>
              </div>
              <p style="color:#888;font-size:12px;text-align:center;">Tot morgen bij MoSaidCuts!</p>
            </div>
          </div>
        `,
      })
      sent++
    } catch { /* non-fatal — log maar stop niet */ }
  }

  return Response.json({ sent, date: tomorrowStr })
}
