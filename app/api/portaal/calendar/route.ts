import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest } from 'next/server'

function fmt(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}00`
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token || token !== process.env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [{ data: bookings }, { data: cancelled }] = await Promise.all([
    supabaseAdmin
      .from('bookings')
      .select('code, name, service, price, date, time, duration, phone')
      .gte('date', today)
      .order('date', { ascending: true })
      .order('time', { ascending: true }),
    supabaseAdmin
      .from('cancelled_bookings')
      .select('code, name, service, date, time')
      .gte('cancelled_at', since24h),
  ])

  const now = fmt(new Date())
  const events = (bookings ?? []).map(b => {
    const [yr, mo, dy] = b.date.split('-').map(Number)
    const [hr, mn] = b.time.split(':').map(Number)
    const start = new Date(yr, mo - 1, dy, hr, mn)
    const end = new Date(start.getTime() + b.duration * 60000)
    return [
      'BEGIN:VEVENT',
      `UID:${b.code}@mosaidcuts.nl`,
      `DTSTART;TZID=Europe/Amsterdam:${fmt(start)}`,
      `DTEND;TZID=Europe/Amsterdam:${fmt(end)}`,
      `SUMMARY:${b.name} – ${b.service}`,
      `DESCRIPTION:Code: ${b.code}\\nDienst: ${b.service}\\nPrijs: €${b.price}\\nTel: ${b.phone}`,
      'LOCATION:MoSaidCuts Barbershop',
      `DTSTAMP:${now}Z`,
      `LAST-MODIFIED:${now}Z`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ].join('\r\n')
  })

  const cancelledEvents = (cancelled ?? []).map(b => {
    const [yr, mo, dy] = b.date.split('-').map(Number)
    const [hr, mn] = b.time.split(':').map(Number)
    const start = new Date(yr, mo - 1, dy, hr, mn)
    const end = new Date(start.getTime() + 30 * 60000)
    return [
      'BEGIN:VEVENT',
      `UID:${b.code}@mosaidcuts.nl`,
      `DTSTART;TZID=Europe/Amsterdam:${fmt(start)}`,
      `DTEND;TZID=Europe/Amsterdam:${fmt(end)}`,
      `SUMMARY:❌ ${b.name} – ${b.service}`,
      `DTSTAMP:${now}Z`,
      `LAST-MODIFIED:${now}Z`,
      'STATUS:CANCELLED',
      'END:VEVENT',
    ].join('\r\n')
  })

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MoSaidCuts//NL',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:MoSaidCuts Afspraken',
    'X-WR-TIMEZONE:Europe/Amsterdam',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
    ...events,
    ...cancelledEvents,
    'END:VCALENDAR',
  ].join('\r\n')

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
