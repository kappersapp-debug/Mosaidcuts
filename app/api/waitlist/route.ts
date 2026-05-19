import { supabaseAdmin } from '@/lib/supabase'
import { transporter } from '@/lib/mailer'

const attempts = new Map<string, { count: number; lockedUntil: number }>()

const NL_DAYS = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag']
const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
function formatDateNL(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${NL_DAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const entry = attempts.get(ip) ?? { count: 0, lockedUntil: 0 }

  if (entry.lockedUntil > now) {
    return Response.json({ error: 'Te veel pogingen. Probeer later opnieuw.' }, { status: 429 })
  }

  const { name, phone, email, preferred_date, service, note } = await request.json()
  if (!name || !preferred_date) {
    return Response.json({ error: 'Naam en datum zijn vereist' }, { status: 400 })
  }

  // Validate date is not blocked and day is open
  const { data: settingsRows } = await supabaseAdmin.from('settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) settings[row.key] = row.value

  if (settings.blocked_dates) {
    const blocked: string[] = JSON.parse(settings.blocked_dates)
    if (blocked.includes(preferred_date)) {
      return Response.json({ error: 'Deze dag is niet beschikbaar' }, { status: 409 })
    }
  }

  const dow = new Date(preferred_date + 'T12:00:00').getDay()
  if (settings.day_schedule) {
    const schedule: Record<string, { open: boolean }> = JSON.parse(settings.day_schedule)
    if (!schedule[String(dow)]?.open) {
      return Response.json({ error: 'Deze dag is niet beschikbaar' }, { status: 409 })
    }
  } else if (settings.availability) {
    const avail: Record<string, boolean> = JSON.parse(settings.availability)
    if (avail[String(dow)] === false) {
      return Response.json({ error: 'Deze dag is niet beschikbaar' }, { status: 409 })
    }
  }

  entry.count += 1
  if (entry.count >= 10) {
    entry.lockedUntil = now + 15 * 60 * 1000
    entry.count = 0
  }
  attempts.set(ip, entry)

  const { error } = await supabaseAdmin.from('waitlist').insert({
    name, phone: phone ?? '', email: email ?? '',
    preferred_date, service: service ?? '', note: note ?? '',
  })

  if (error) return Response.json({ error: 'Opslaan mislukt' }, { status: 500 })

  attempts.delete(ip)

  // Confirmation email
  if (email) {
    try {
      await transporter.sendMail({
        from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Wachtlijst bevestigd – MoSaidCuts',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
            <div style="background:#1d4ed8;padding:24px 32px;border-radius:12px 12px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:24px;">✂ MoSaidCuts</h1>
            </div>
            <div style="background:#f9fafb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
              <h2 style="color:#1d4ed8;margin-top:0;">Je staat op de wachtlijst!</h2>
              <p>Hallo <strong>${name}</strong>, je aanmelding is ontvangen.</p>
              <div style="background:#dbeafe;border-radius:10px;padding:20px;margin:20px 0;">
                <p style="margin:6px 0;"><strong>Voorkeursdatum:</strong> ${formatDateNL(preferred_date)}</p>
                ${service ? `<p style="margin:6px 0;"><strong>Dienst:</strong> ${service}</p>` : ''}
                ${note ? `<p style="margin:6px 0;"><strong>Notitie:</strong> ${note}</p>` : ''}
              </div>
              <p style="color:#555;font-size:14px;">Zodra er een plek vrijkomt word je ingepland en ontvang je een bevestiging van je afspraak.</p>
              <p style="color:#888;font-size:12px;text-align:center;margin-top:24px;">MoSaidCuts — Altijd scherp</p>
            </div>
          </div>
        `,
      })
    } catch { /* non-fatal */ }
  }

  return Response.json({ success: true })
}
