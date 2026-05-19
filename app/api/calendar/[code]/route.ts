export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest } from 'next/server'

function fmt(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}00`
}
function icsEsc(s: unknown) {
  return String(s ?? '').replace(/[\r\n]/g, ' ').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params
  const code = rawCode.replace(/\.ics$/i, '').toUpperCase()

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('code, name, service, price, date, time, duration')
    .eq('code', code)
    .single()

  if (!booking) return new Response('Not found', { status: 404 })

  const [yr, mo, dy] = booking.date.split('-').map(Number)
  const [hr, mn] = booking.time.split(':').map(Number)
  const start = new Date(yr, mo - 1, dy, hr, mn)
  const end = new Date(start.getTime() + booking.duration * 60000)
  const now = fmt(new Date())

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MoSaidCuts//NL',
    'METHOD:PUBLISH',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1M',
    'X-PUBLISHED-TTL:PT1M',
    'BEGIN:VEVENT',
    `UID:${booking.code}@mosaidcuts.nl`,
    `DTSTART;TZID=Europe/Amsterdam:${fmt(start)}`,
    `DTEND;TZID=Europe/Amsterdam:${fmt(end)}`,
    `SUMMARY:${icsEsc(booking.service)} bij MoSaidCuts`,
    `DESCRIPTION:Boekingscode: ${booking.code}\\nNaam: ${icsEsc(booking.name)}\\nPrijs: €${booking.price}`,
    'LOCATION:MoSaidCuts Barbershop',
    `DTSTAMP:${now}Z`,
    `LAST-MODIFIED:${now}Z`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
