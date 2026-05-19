export const dynamic = 'force-dynamic'

import { verifyPortalAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

function fmt(dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = timeStr.split(':').map(Number)
  return `${String(y)}${String(mo).padStart(2,'0')}${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}${String(m).padStart(2,'0')}00`
}

function fmtEnd(dateStr: string, timeStr: string, duration: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = timeStr.split(':').map(Number)
  const end = new Date(y, mo - 1, d, h, m + duration)
  return `${end.getFullYear()}${String(end.getMonth()+1).padStart(2,'0')}${String(end.getDate()).padStart(2,'0')}T${String(end.getHours()).padStart(2,'0')}${String(end.getMinutes()).padStart(2,'0')}00`
}

export async function GET() {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data: bookings } = await supabaseAdmin
    .from('bookings').select('*').order('date').order('time')

  const now = fmt(new Date().toISOString().split('T')[0], `${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`)

  const events = (bookings ?? []).map(b => [
    'BEGIN:VEVENT',
    `UID:${b.code}@mosaidcuts.nl`,
    `DTSTART:${fmt(b.date, b.time)}`,
    `DTEND:${fmtEnd(b.date, b.time, b.duration)}`,
    `SUMMARY:${b.service} – ${b.name}`,
    `DESCRIPTION:Code: ${b.code}\\nTel: ${b.phone}\\nEmail: ${b.email}`,
    'LOCATION:MoSaidCuts Barbershop',
    `DTSTAMP:${now}`,
    'END:VEVENT',
  ].join('\r\n')).join('\r\n')

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MoSaidCuts//NL',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:MoSaidCuts Afspraken',
    events,
    'END:VCALENDAR',
  ].join('\r\n')

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mosaidcuts-afspraken.ics"',
    },
  })
}
