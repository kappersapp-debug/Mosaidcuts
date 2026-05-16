import { verifyPortalAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest } from 'next/server'
import { transporter } from '@/lib/mailer'
import { cancelMailHtml } from '@/app/api/bookings/cancel/route'

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
    const start = `${month}-01`
    const end = `${month}-31`
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
  const { name, phone, email, service, price, duration, date, time } = await request.json()
  if (!name || !email || !service || !date || !time) {
    return Response.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
  }

  let code = generateCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await supabaseAdmin.from('bookings').select('id').eq('code', code).single()
    if (!data) break
    code = generateCode()
  }

  const { error } = await supabaseAdmin.from('bookings').insert({
    code, name, phone: phone ?? '', email: email.toLowerCase(),
    service, price: price ?? 0, duration: duration ?? 30, date, time,
  })
  if (error) return Response.json({ error: 'Opslaan mislukt' }, { status: 500 })
  return Response.json({ success: true, code })
}

export async function PATCH(request: Request) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }
  const { id, name, phone, email, service, price, duration, date, time } = await request.json()
  if (!id) return Response.json({ error: 'id vereist' }, { status: 400 })

  const { error } = await supabaseAdmin.from('bookings').update({
    name, phone, email: email?.toLowerCase(), service, price, duration, date, time,
  }).eq('id', id)
  if (error) return Response.json({ error: 'Bijwerken mislukt' }, { status: 500 })
  return Response.json({ success: true })
}
