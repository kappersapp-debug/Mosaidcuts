import { verifyPortalAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest } from 'next/server'
import { transporter } from '@/lib/mailer'
import { cancelMailHtml } from '@/app/api/bookings/cancel/route'

export async function GET(request: NextRequest) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') ?? 'all'
  const search = searchParams.get('search') ?? ''
  const month = searchParams.get('month') // YYYY-MM for calendar

  const today = new Date().toISOString().split('T')[0]

  // Polling endpoint: return only bookings created after `since`
  const since = searchParams.get('since')
  if (since) {
    const { data, error } = await supabaseAdmin
      .from('bookings').select('*').gt('created_at', since).order('created_at', { ascending: false })
    if (error) return Response.json({ error: 'Database fout' }, { status: 500 })
    return Response.json({ bookings: data })
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
