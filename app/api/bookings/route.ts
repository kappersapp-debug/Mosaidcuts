import { supabaseAdmin } from '@/lib/supabase'
import { transporter } from '@/lib/mailer'
import { rateLimit } from '@/lib/rate-limit'

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'MSC'
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

const NL_DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
const NL_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

function formatDateNL(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${NL_DAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!rateLimit(`booking:${ip}`, 10, 15 * 60 * 1000)) {
    return Response.json({ error: 'Te veel verzoeken. Probeer later opnieuw.' }, { status: 429 })
  }

  const body = await request.json()
  const { name, phone, email, service, price, duration, date, time } = body

  if (!name || !phone || !email || !service || !date || !time) {
    return Response.json({ error: 'Alle velden zijn vereist' }, { status: 400 })
  }
  if (name.length > 100 || phone.length > 30 || email.length > 254 || service.length > 100) {
    return Response.json({ error: 'Ongeldige invoer' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return Response.json({ error: 'Ongeldige datum of tijd' }, { status: 400 })
  }

  // Validate against opening hours + blocked dates server-side
  const { data: settingsRows } = await supabaseAdmin.from('settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) settings[row.key] = row.value

  const dow = new Date(date + 'T12:00:00').getDay()

  if (settings.blocked_dates) {
    const blocked: string[] = JSON.parse(settings.blocked_dates)
    if (blocked.includes(date)) return Response.json({ error: 'Dit tijdslot is niet meer beschikbaar' }, { status: 409 })
  }

  let workStart = '09:00'
  let workEnd = '17:00'
  if (settings.day_schedule) {
    const schedule: Record<string, { open: boolean; start: string; end: string }> = JSON.parse(settings.day_schedule)
    const cfg = schedule[String(dow)]
    if (!cfg || !cfg.open) return Response.json({ error: 'Dit tijdslot is niet meer beschikbaar' }, { status: 409 })
    workStart = cfg.start
    workEnd = cfg.end
  } else if (settings.availability) {
    const avail: Record<string, boolean> = JSON.parse(settings.availability)
    if (avail[String(dow)] === false) return Response.json({ error: 'Dit tijdslot is niet meer beschikbaar' }, { status: 409 })
    workStart = settings.work_start ?? '09:00'
    workEnd = settings.work_end ?? '17:00'
  }
  const [wsH, wsM] = workStart.split(':').map(Number)
  const [weH, weM] = workEnd.split(':').map(Number)
  const workStartMins = wsH * 60 + wsM
  const workEndMins = weH * 60 + weM
  const [th2, tm2] = time.split(':').map(Number)
  const tStartCheck = th2 * 60 + tm2
  if (tStartCheck < workStartMins || tStartCheck + duration > workEndMins) {
    return Response.json({ error: 'Dit tijdslot is niet meer beschikbaar' }, { status: 409 })
  }

  // Reject past time slots for today (server UTC+1 = NL winter time, conservative)
  const todayServer = new Date().toISOString().split('T')[0]
  if (date === todayServer) {
    const nowNl = new Date(Date.now() + 60 * 60 * 1000)
    const nowNlMins = nowNl.getUTCHours() * 60 + nowNl.getUTCMinutes()
    if (tStartCheck <= nowNlMins) {
      return Response.json({ error: 'Dit tijdslot is niet meer beschikbaar' }, { status: 409 })
    }
  }

  // Block banned emails
  if (email) {
    const { data: banned } = await supabaseAdmin.from('banned_emails').select('id').eq('email', email.toLowerCase()).single()
    if (banned) return Response.json({ error: 'Boeking niet mogelijk' }, { status: 403 })
  }

  // Check again if slot is still available
  const { data: existing } = await supabaseAdmin
    .from('bookings')
    .select('time, duration')
    .eq('date', date)

  const [th, tm] = time.split(':').map(Number)
  const tStart = th * 60 + tm
  const tEnd = tStart + duration

  for (const b of existing ?? []) {
    const [bh, bm] = b.time.split(':').map(Number)
    const bStart = bh * 60 + bm
    const bEnd = bStart + b.duration
    if (bStart < tEnd && tStart < bEnd) {
      return Response.json({ error: 'Dit tijdslot is niet meer beschikbaar' }, { status: 409 })
    }
  }

  // Generate unique booking code
  let code = generateCode()
  let attempt = 0
  while (attempt < 5) {
    const { data: exists } = await supabaseAdmin.from('bookings').select('id').eq('code', code).single()
    if (!exists) break
    code = generateCode()
    attempt++
  }

  const { error } = await supabaseAdmin.from('bookings').insert({
    code, name, phone,
    email: email.toLowerCase(),
    service, price, duration, date, time,
  })

  if (error) return Response.json({ error: 'Boeking kon niet worden opgeslagen' }, { status: 500 })

  // Send confirmation email via Gmail
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_BASE_URL) {
    console.warn('[MoSaidCuts] NEXT_PUBLIC_BASE_URL is niet ingesteld in productie — annuleerlinks wijzen naar localhost')
  }
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const cancelUrl = `${base}/?annuleer=${code}`
  const rescheduleUrl = `${base}/?verzet=${code}`

  try {
    await transporter.sendMail({
      from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Afspraak bevestigd – ${code}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
          <div style="background:#1d4ed8;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:24px;">✂ MoSaidCuts</h1>
          </div>
          <div style="background:#f9fafb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
            <h2 style="color:#1d4ed8;margin-top:0;">Afspraak bevestigd!</h2>
            <p>Hallo <strong>${esc(name)}</strong>, uw afspraak is bevestigd.</p>
            <div style="background:#dbeafe;border-radius:10px;padding:20px;margin:20px 0;">
              <p style="margin:6px 0;"><strong>Boekingscode:</strong> <span style="font-size:18px;font-weight:800;color:#1d4ed8;">${code}</span></p>
              <p style="margin:6px 0;"><strong>Dienst:</strong> ${esc(service)}</p>
              <p style="margin:6px 0;"><strong>Datum:</strong> ${formatDateNL(date)}</p>
              <p style="margin:6px 0;"><strong>Tijd:</strong> ${time}</p>
              <p style="margin:6px 0;"><strong>Prijs:</strong> €${price}</p>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${rescheduleUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none;font-size:14px;margin-right:8px;">Afspraak verzetten</a>
              <a href="${cancelUrl}" style="display:inline-block;background:#dc2626;color:#fff;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none;font-size:14px;">Afspraak annuleren</a>
            </div>
            <p style="color:#888;font-size:12px;text-align:center;">Of gebruik boekingscode <strong>${code}</strong> op de website.</p>
          </div>
        </div>
      `,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[MoSaidCuts] Bevestigingsmail mislukt:', msg)
  }

  // Stuur melding naar kapper als instelling aan staat
  const { data: notifSetting } = await supabaseAdmin
    .from('settings').select('value').eq('key', 'notifications_new_booking').single()

  if (notifSetting?.value === 'true' && process.env.GMAIL_USER) {
    try {
      await transporter.sendMail({
        from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER,
        subject: `🔔 Nieuwe afspraak – ${name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
            <div style="background:#1d4ed8;padding:20px 28px;border-radius:10px 10px 0 0;">
              <h2 style="color:#fff;margin:0;">✂ Nieuwe afspraak</h2>
            </div>
            <div style="background:#f9fafb;padding:24px 28px;border-radius:0 0 10px 10px;border:1px solid #e5e7eb;">
              <p style="margin:6px 0;"><strong>Naam:</strong> ${esc(name)}</p>
              <p style="margin:6px 0;"><strong>Dienst:</strong> ${esc(service)}</p>
              <p style="margin:6px 0;"><strong>Datum:</strong> ${formatDateNL(date)}</p>
              <p style="margin:6px 0;"><strong>Tijd:</strong> ${time}</p>
              <p style="margin:6px 0;"><strong>Tel:</strong> ${esc(phone)}</p>
              <p style="margin:6px 0;"><strong>Code:</strong> ${code}</p>
            </div>
          </div>
        `,
      })
    } catch { /* non-fatal */ }
  }

  return Response.json({ success: true, code, service, price, duration, date, time, name })
}
