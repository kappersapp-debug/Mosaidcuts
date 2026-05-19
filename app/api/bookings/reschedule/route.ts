import { supabaseAdmin } from '@/lib/supabase'
import { transporter } from '@/lib/mailer'
import { rateLimit } from '@/lib/rate-limit'

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const NL_DAYS = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag']
const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
function formatDateNL(ds: string) {
  const d = new Date(ds + 'T12:00:00')
  return `${NL_DAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!rateLimit(`reschedule:${ip}`, 5, 15 * 60 * 1000)) {
    return Response.json({ error: 'Te veel pogingen. Probeer later opnieuw.' }, { status: 429 })
  }

  const { code, email, date, time } = await request.json()
  if (!code || !email || !date || !time) {
    return Response.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return Response.json({ error: 'Ongeldige datum of tijd' }, { status: 400 })
  }
  const [tHour, tMin] = time.split(':').map(Number)
  if (tHour > 23 || tMin > 59) {
    return Response.json({ error: 'Ongeldige datum of tijd' }, { status: 400 })
  }

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, email, name, service, price, duration, date, time, code')
    .eq('code', code.toUpperCase())
    .single()

  if (!booking || booking.email.toLowerCase() !== email.toLowerCase().trim()) {
    return Response.json({ error: 'Boeking niet gevonden' }, { status: 404 })
  }

  const today = new Date().toISOString().split('T')[0]
  if (date < today) {
    return Response.json({ error: 'Datum is in het verleden' }, { status: 409 })
  }
  if (date === booking.date && time === booking.time) {
    return Response.json({ error: 'Dit is al uw huidige afspraak' }, { status: 409 })
  }

  // Validate day is open + not blocked
  const { data: settingsRows } = await supabaseAdmin.from('settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) settings[row.key] = row.value

  const dow = new Date(date + 'T12:00:00').getDay()
  if (settings.blocked_dates) {
    const blocked: string[] = JSON.parse(settings.blocked_dates)
    if (blocked.includes(date)) return Response.json({ error: 'Dit tijdslot is niet beschikbaar' }, { status: 409 })
  }
  if (settings.day_schedule) {
    const sched: Record<string, { open: boolean }> = JSON.parse(settings.day_schedule)
    if (!sched[String(dow)]?.open) return Response.json({ error: 'Dit tijdslot is niet beschikbaar' }, { status: 409 })
  } else if (settings.availability) {
    const avail: Record<string, boolean> = JSON.parse(settings.availability)
    if (avail[String(dow)] === false) return Response.json({ error: 'Dit tijdslot is niet beschikbaar' }, { status: 409 })
  }

  // Check new slot is free (exclude current booking)
  const { data: existing } = await supabaseAdmin
    .from('bookings').select('time, duration').eq('date', date).neq('id', booking.id)

  const [th, tm] = time.split(':').map(Number)
  const tStart = th * 60 + tm
  const tEnd = tStart + booking.duration

  for (const b of existing ?? []) {
    const [bh, bm] = b.time.split(':').map(Number)
    const bStart = bh * 60 + bm
    if (bStart < tEnd && tStart < bStart + b.duration) {
      return Response.json({ error: 'Dit tijdslot is niet meer beschikbaar' }, { status: 409 })
    }
  }

  const { error } = await supabaseAdmin
    .from('bookings').update({ date, time }).eq('id', booking.id)
  if (error) return Response.json({ error: 'Bijwerken mislukt' }, { status: 500 })

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const cancelUrl = `${base}/?annuleer=${booking.code}`
  const rescheduleUrl = `${base}/?verzet=${booking.code}`
  try {
    await transporter.sendMail({
      from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
      to: booking.email,
      subject: `Afspraak verzet – ${booking.code}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
          <div style="background:#1d4ed8;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:24px;">✂ MoSaidCuts</h1>
          </div>
          <div style="background:#f9fafb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
            <h2 style="color:#1d4ed8;margin-top:0;">Afspraak verzet</h2>
            <p>Hallo <strong>${esc(booking.name)}</strong>, uw afspraak is succesvol verzet.</p>
            <div style="background:#dbeafe;border-radius:10px;padding:20px;margin:20px 0;">
              <p style="margin:6px 0;"><strong>Boekingscode:</strong> <span style="font-size:18px;font-weight:800;color:#1d4ed8;">${booking.code}</span></p>
              <p style="margin:6px 0;"><strong>Dienst:</strong> ${esc(booking.service)}</p>
              <p style="margin:6px 0;"><strong>Nieuwe datum:</strong> ${formatDateNL(date)}</p>
              <p style="margin:6px 0;"><strong>Nieuwe tijd:</strong> ${time}</p>
              <p style="margin:6px 0;"><strong>Prijs:</strong> €${booking.price}</p>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${rescheduleUrl}" style="display:block;background:#1d4ed8;color:#fff;font-weight:700;padding:13px 22px;border-radius:10px;text-decoration:none;font-size:15px;margin-bottom:10px;">Afspraak verzetten</a>
              <a href="${cancelUrl}" style="display:block;background:#dc2626;color:#fff;font-weight:700;padding:13px 22px;border-radius:10px;text-decoration:none;font-size:15px;">Afspraak annuleren</a>
            </div>
            <p style="color:#888;font-size:12px;text-align:center;">Of gebruik boekingscode <strong>${booking.code}</strong> op de website.</p>
          </div>
        </div>
      `,
    })
  } catch { /* non-fatal */ }

  return Response.json({ success: true, date, time })
}
