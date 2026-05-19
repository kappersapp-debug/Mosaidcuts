import { supabaseAdmin } from '@/lib/supabase'
import { transporter } from '@/lib/mailer'

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const NL_DAYS = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag']
const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
function fmtDate(ds: string) {
  const d = new Date(ds + 'T12:00:00')
  return `${NL_DAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function cancelMailHtml(b: { name: string; code: string; service: string; date: string; time: string }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#dc2626;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:24px;">✂ MoSaidCuts</h1>
      </div>
      <div style="background:#f9fafb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <h2 style="color:#dc2626;margin-top:0;">Afspraak geannuleerd</h2>
        <p>Hallo <strong>${esc(b.name)}</strong>, uw afspraak is geannuleerd.</p>
        <div style="background:#fee2e2;border-radius:10px;padding:20px;margin:20px 0;">
          <p style="margin:6px 0;"><strong>Code:</strong> ${b.code}</p>
          <p style="margin:6px 0;"><strong>Dienst:</strong> ${esc(b.service)}</p>
          <p style="margin:6px 0;"><strong>Datum:</strong> ${fmtDate(b.date)}</p>
          <p style="margin:6px 0;"><strong>Tijd:</strong> ${b.time}</p>
        </div>
        <p style="color:#888;font-size:13px;">Wilt u een nieuwe afspraak maken? Ga naar onze website.</p>
      </div>
    </div>
  `
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')?.toUpperCase()
  if (!code) return Response.json({ status: 'not_found' })

  const { data: active } = await supabaseAdmin
    .from('bookings').select('id, name, service, price, duration, date, time').eq('code', code).single()
  if (active) return Response.json({ status: 'active', name: active.name, service: active.service, price: active.price, duration: active.duration, date: active.date, time: active.time })

  const { data: cancelled } = await supabaseAdmin
    .from('cancelled_bookings').select('code').eq('code', code).single()
  if (cancelled) return Response.json({ status: 'cancelled' })

  return Response.json({ status: 'not_found' })
}

const attempts = new Map<string, { count: number; lockedUntil: number }>()

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const entry = attempts.get(ip) ?? { count: 0, lockedUntil: 0 }

  if (entry.lockedUntil > now) {
    return Response.json({ error: 'Te veel pogingen. Probeer later opnieuw.' }, { status: 429 })
  }

  const { code, email } = await request.json()
  if (!code || !email) return Response.json({ error: 'Code en e-mail zijn vereist' }, { status: 400 })

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, email, name, service, date, time, code')
    .eq('code', code.toUpperCase())
    .single()

  if (!booking || booking.email.toLowerCase() !== email.toLowerCase().trim()) {
    entry.count += 1
    if (entry.count >= 5) {
      entry.lockedUntil = now + 15 * 60 * 1000
      entry.count = 0
    }
    attempts.set(ip, entry)
    return Response.json({ error: 'Boeking niet gevonden' }, { status: 404 })
  }

  attempts.delete(ip)
  await supabaseAdmin.from('cancelled_bookings').insert({
    code: booking.code, name: booking.name, service: booking.service,
    date: booking.date, time: booking.time, cancelled_by: 'customer',
  })
  await supabaseAdmin.from('bookings').delete().eq('id', booking.id)

  try {
    await transporter.sendMail({
      to: booking.email,
      subject: `Afspraak geannuleerd – ${booking.code}`,
      html: cancelMailHtml(booking),
    })
  } catch { /* non-fatal */ }

  return Response.json({ success: true })
}
