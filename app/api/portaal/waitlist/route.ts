import { verifyPortalAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { transporter } from '@/lib/mailer'

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const NL_DAYS = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag']
const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
function formatDateNL(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${NL_DAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'MSC'
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function GET() {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]

  // Auto-remove entries whose preferred date has passed
  await supabaseAdmin.from('waitlist').delete().lt('preferred_date', today)

  const { data, error } = await supabaseAdmin
    .from('waitlist')
    .select('*')
    .order('preferred_date', { ascending: true })
    .order('id', { ascending: true })

  if (error) return Response.json({ error: 'Database fout' }, { status: 500 })
  return Response.json({ waitlist: data ?? [] })
}

export async function POST(request: Request) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { waitlist_id, date, time, service, price, duration } = await request.json()
  if (!waitlist_id || !date || !time || !service) {
    return Response.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
  }

  const { data: entry } = await supabaseAdmin
    .from('waitlist').select('*').eq('id', waitlist_id).single()
  if (!entry) return Response.json({ error: 'Wachtlijst entry niet gevonden' }, { status: 404 })

  // Check slot is still available
  const { data: existing } = await supabaseAdmin.from('bookings').select('time, duration').eq('date', date)
  const [th, tm] = time.split(':').map(Number)
  const tStart = th * 60 + tm
  const tEnd = tStart + (duration ?? 30)
  for (const b of existing ?? []) {
    const [bh, bm] = b.time.split(':').map(Number)
    const bStart = bh * 60 + bm
    const bEnd = bStart + b.duration
    if (bStart < tEnd && tStart < bEnd) {
      return Response.json({ error: 'Dit tijdslot is niet meer beschikbaar' }, { status: 409 })
    }
  }

  // Unique booking code
  let code = generateCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await supabaseAdmin.from('bookings').select('id').eq('code', code).single()
    if (!data) break
    code = generateCode()
  }

  const normalizedEmail = entry.email ? entry.email.toLowerCase() : ''

  const { error: insertError } = await supabaseAdmin.from('bookings').insert({
    code,
    name: entry.name,
    phone: entry.phone ?? '',
    email: normalizedEmail,
    service,
    price: price ?? 0,
    duration: duration ?? 30,
    date,
    time,
    notes: entry.note ?? '',
  })
  if (insertError) return Response.json({ error: 'Opslaan mislukt' }, { status: 500 })

  // Delete from waitlist
  await supabaseAdmin.from('waitlist').delete().eq('id', waitlist_id)

  // Send confirmation email
  if (normalizedEmail) {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const cancelUrl = `${base}/?annuleer=${code}`
    const rescheduleUrl = `${base}/?verzet=${code}`
    try {
      await transporter.sendMail({
        from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
        to: normalizedEmail,
        subject: `Afspraak bevestigd – ${code}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
            <div style="background:#1d4ed8;padding:24px 32px;border-radius:12px 12px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:24px;">✂ MoSaidCuts</h1>
            </div>
            <div style="background:#f9fafb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
              <h2 style="color:#1d4ed8;margin-top:0;">Je bent ingepland!</h2>
              <p>Hallo <strong>${esc(entry.name)}</strong>, goed nieuws — je staat nu ingepland.</p>
              <div style="background:#dbeafe;border-radius:10px;padding:20px;margin:20px 0;">
                <p style="margin:6px 0;"><strong>Boekingscode:</strong> <span style="font-size:18px;font-weight:800;color:#1d4ed8;">${code}</span></p>
                <p style="margin:6px 0;"><strong>Dienst:</strong> ${esc(service)}</p>
                <p style="margin:6px 0;"><strong>Datum:</strong> ${formatDateNL(date)}</p>
                <p style="margin:6px 0;"><strong>Tijd:</strong> ${time}</p>
                <p style="margin:6px 0;"><strong>Prijs:</strong> €${price ?? 0}</p>
              </div>
              <div style="text-align:center;margin:24px 0;">
                <a href="${rescheduleUrl}" style="display:block;background:#1d4ed8;color:#fff;font-weight:700;padding:13px 22px;border-radius:10px;text-decoration:none;font-size:15px;margin-bottom:10px;">Afspraak verzetten</a>
                <a href="${cancelUrl}" style="display:block;background:#dc2626;color:#fff;font-weight:700;padding:13px 22px;border-radius:10px;text-decoration:none;font-size:15px;">Afspraak annuleren</a>
              </div>
              <p style="color:#888;font-size:12px;text-align:center;">Of gebruik boekingscode <strong>${code}</strong> op de website.</p>
            </div>
          </div>
        `,
      })
    } catch { /* non-fatal */ }
  }

  return Response.json({ success: true, code })
}

export async function DELETE(request: Request) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { id } = await request.json()
  if (!id) return Response.json({ error: 'id vereist' }, { status: 400 })

  await supabaseAdmin.from('waitlist').delete().eq('id', id)
  return Response.json({ success: true })
}
