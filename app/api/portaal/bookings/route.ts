export const dynamic = 'force-dynamic'

import { verifyPortalAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest } from 'next/server'
import { transporter } from '@/lib/mailer'
import { cancelMailHtml } from '@/app/api/bookings/cancel/route'

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const NL_DAYS = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag']
const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

function formatDateNL(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${NL_DAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'MSC'
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function GET(request: NextRequest) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') ?? 'all'
  const search = searchParams.get('search') ?? ''
  const month = searchParams.get('month') // YYYY-MM for calendar

  const today = new Date().toISOString().split('T')[0]

  // Polling endpoint: return new bookings + cancellations since `since`
  const since = searchParams.get('since')
  if (since) {
    const [{ data: newBookings }, { data: cancellations }] = await Promise.all([
      supabaseAdmin.from('bookings').select('*').gt('created_at', since).order('created_at', { ascending: false }),
      supabaseAdmin.from('cancelled_bookings').select('*').gt('cancelled_at', since).order('cancelled_at', { ascending: false }),
    ])
    return Response.json({ bookings: newBookings ?? [], cancellations: cancellations ?? [] })
  }

  let query = supabaseAdmin.from('bookings').select('*').order('date', { ascending: true }).order('time', { ascending: true })

  if (filter === 'today') {
    query = query.eq('date', today)
  } else if (filter === 'upcoming') {
    query = query.gte('date', today)
  } else if (filter === 'past') {
    query = query.lt('date', today)
  }

  if (month) {
    const [yr, mo] = month.split('-').map(Number)
    const lastDay = new Date(yr, mo, 0).getDate()
    const start = `${month}-01`
    const end = `${month}-${String(lastDay).padStart(2, '0')}`
    query = query.gte('date', start).lte('date', end)
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,code.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) return Response.json({ error: 'Database fout' }, { status: 500 })

  return Response.json({ bookings: data })
}

export async function DELETE(request: Request) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { id } = await request.json()
  if (!id) return Response.json({ error: 'id vereist' }, { status: 400 })

  const { data: booking } = await supabaseAdmin
    .from('bookings').select('email, name, code, service, date, time').eq('id', id).single()

  if (booking) {
    await supabaseAdmin.from('cancelled_bookings').insert({
      code: booking.code, name: booking.name, service: booking.service,
      date: booking.date, time: booking.time, cancelled_by: 'portal',
    })
  }
  const { error } = await supabaseAdmin.from('bookings').delete().eq('id', id)
  if (error) return Response.json({ error: 'Fout bij verwijderen' }, { status: 500 })

  if (booking) {
    try {
      await transporter.sendMail({
        to: booking.email,
        subject: `Afspraak geannuleerd – ${booking.code}`,
        html: cancelMailHtml(booking),
      })
    } catch { /* non-fatal */ }
  }

  return Response.json({ success: true })
}

export async function POST(request: Request) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }
  const { name, phone, email, service, price, duration, date, time, notes } = await request.json()
  if (!name || !service || !date || !time) {
    return Response.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
  }

  let code = generateCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await supabaseAdmin.from('bookings').select('id').eq('code', code).single()
    if (!data) break
    code = generateCode()
  }

  const normalizedEmail = email ? email.toLowerCase() : ''

  const { error } = await supabaseAdmin.from('bookings').insert({
    code, name, phone: phone ?? '', email: normalizedEmail,
    service, price: price ?? 0, duration: duration ?? 30, date, time,
    notes: notes ?? '',
  })
  if (error) return Response.json({ error: 'Opslaan mislukt' }, { status: 500 })

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
              <h2 style="color:#1d4ed8;margin-top:0;">Afspraak bevestigd!</h2>
              <p>Hallo <strong>${esc(name)}</strong>, uw afspraak is bevestigd.</p>
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

export async function PATCH(request: Request) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }
  const body = await request.json()
  const { id } = body
  if (!id) return Response.json({ error: 'id vereist' }, { status: 400 })

  // Quick no-show toggle — only id + no_show sent
  if ('no_show' in body && !body.name) {
    const { error } = await supabaseAdmin.from('bookings').update({ no_show: body.no_show }).eq('id', id)
    if (error) return Response.json({ error: 'Bijwerken mislukt' }, { status: 500 })
    return Response.json({ success: true })
  }

  const { name, phone, email, service, price, duration, date, time, notes } = body
  const normalizedEmail = email ? email.toLowerCase() : ''

  // Check slot availability for new date/time (excluding current booking)
  if (date && time) {
    const { data: existing } = await supabaseAdmin.from('bookings').select('time, duration').eq('date', date).neq('id', id)
    const [th, tm] = time.split(':').map(Number)
    const tStart = th * 60 + tm
    const tEnd = tStart + (duration ?? 30)
    for (const b of existing ?? []) {
      const [bh, bm] = b.time.split(':').map(Number)
      const bStart = bh * 60 + bm
      const bEnd = bStart + b.duration
      if (bStart < tEnd && tStart < bEnd) {
        return Response.json({ error: 'Dit tijdslot is al bezet' }, { status: 409 })
      }
    }
  }

  const { data: updated, error } = await supabaseAdmin.from('bookings').update({
    name, phone, email: normalizedEmail, service, price, duration, date, time,
    notes: notes ?? '',
  }).eq('id', id).select('code').single()
  if (error) return Response.json({ error: 'Bijwerken mislukt' }, { status: 500 })

  if (normalizedEmail && updated?.code) {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const cancelUrl = `${base}/?annuleer=${updated.code}`
    const rescheduleUrl = `${base}/?verzet=${updated.code}`
    try {
      await transporter.sendMail({
        from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
        to: normalizedEmail,
        subject: `Afspraak bijgewerkt – ${updated.code}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
            <div style="background:#1d4ed8;padding:24px 32px;border-radius:12px 12px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:24px;">✂ MoSaidCuts</h1>
            </div>
            <div style="background:#f9fafb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
              <h2 style="color:#1d4ed8;margin-top:0;">Afspraak bijgewerkt</h2>
              <p>Hallo <strong>${esc(name)}</strong>, uw afspraak is bijgewerkt.</p>
              <div style="background:#dbeafe;border-radius:10px;padding:20px;margin:20px 0;">
                <p style="margin:6px 0;"><strong>Boekingscode:</strong> <span style="font-size:18px;font-weight:800;color:#1d4ed8;">${updated.code}</span></p>
                <p style="margin:6px 0;"><strong>Dienst:</strong> ${esc(service)}</p>
                <p style="margin:6px 0;"><strong>Datum:</strong> ${formatDateNL(date)}</p>
                <p style="margin:6px 0;"><strong>Tijd:</strong> ${time}</p>
                <p style="margin:6px 0;"><strong>Prijs:</strong> €${price ?? 0}</p>
              </div>
              <div style="text-align:center;margin:24px 0;">
                <a href="${rescheduleUrl}" style="display:block;background:#1d4ed8;color:#fff;font-weight:700;padding:13px 22px;border-radius:10px;text-decoration:none;font-size:15px;margin-bottom:10px;">Afspraak verzetten</a>
                <a href="${cancelUrl}" style="display:block;background:#dc2626;color:#fff;font-weight:700;padding:13px 22px;border-radius:10px;text-decoration:none;font-size:15px;">Afspraak annuleren</a>
              </div>
              <p style="color:#888;font-size:12px;text-align:center;">Of gebruik boekingscode <strong>${updated.code}</strong> op de website.</p>
            </div>
          </div>
        `,
      })
    } catch { /* non-fatal */ }
  }

  return Response.json({ success: true })
}
