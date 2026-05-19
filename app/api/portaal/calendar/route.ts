export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest } from 'next/server'

function fmt(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}00`
}
function icsEsc(s: unknown) {
  return String(s ?? '').replace(/[\r\n]/g, ' ').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token || token !== process.env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]

  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('code, name, service, price, date, time, duration, phone')
    .gte('date', today)
    .order('date', { ascending: true })
    .order('time', { ascending: true })

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
      `SUMMARY:${icsEsc(b.name)} – ${icsEsc(b.service)}`,
      `DESCRIPTION:Code: ${b.code}\\nDienst: ${icsEsc(b.service)}\\nPrijs: €${b.price}\\nTel: ${icsEsc(b.phone)}`,
      'LOCATION:MoSaidCuts Barbershop',
      `DTSTAMP:${now}Z`,
      `LAST-MODIFIED:${now}Z`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ].join('\r\n')
  })


  const vtimezone = [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Amsterdam',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ].join('\r\n')

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MoSaidCuts//NL',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:MoSaidCuts Afspraken',
    'X-WR-TIMEZONE:Europe/Amsterdam',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1M',
    'X-PUBLISHED-TTL:PT1M',
    vtimezone,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
