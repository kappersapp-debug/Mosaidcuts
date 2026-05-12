import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const duration = parseInt(searchParams.get('duration') || '30')

  if (!date) return Response.json({ error: 'date vereist' }, { status: 400 })

  // Fetch all settings at once
  const { data: settingsRows } = await supabaseAdmin.from('settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) settings[row.key] = row.value

  const dow = new Date(date + 'T12:00:00').getDay()

  // Check blocked specific dates
  if (settings.blocked_dates) {
    const blocked: string[] = JSON.parse(settings.blocked_dates)
    if (blocked.includes(date)) return Response.json({ slots: [] })
  }

  // Per-day schedule (new) or fall back to legacy availability + work_start/end
  let workStart = '09:00'
  let workEnd = '17:00'

  if (settings.day_schedule) {
    const schedule: Record<string, {open: boolean; start: string; end: string}> = JSON.parse(settings.day_schedule)
    const cfg = schedule[String(dow)]
    if (!cfg || !cfg.open) return Response.json({ slots: [] })
    workStart = cfg.start
    workEnd = cfg.end
  } else {
    if (settings.availability) {
      const avail: Record<string, boolean> = JSON.parse(settings.availability)
      if (avail[String(dow)] === false) return Response.json({ slots: [] })
    }
    workStart = settings.work_start ?? '09:00'
    workEnd = settings.work_end ?? '17:00'
  }
  const [startH, startM] = workStart.split(':').map(Number)
  const [endH, endM] = workEnd.split(':').map(Number)
  const startMins = startH * 60 + startM
  const endMins = endH * 60 + endM

  // Generate slots
  const allSlots: string[] = []
  for (let m = startMins; m < endMins; m += 30) {
    allSlots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }

  // Fetch existing bookings for this date
  const { data: bookings } = await supabaseAdmin
    .from('bookings').select('time, duration').eq('date', date)

  const blocked = new Set<string>()

  // Block slots overlapping with existing bookings
  for (const b of bookings ?? []) {
    const [bh, bm] = b.time.split(':').map(Number)
    const bStart = bh * 60 + bm
    const bEnd = bStart + b.duration
    for (const slot of allSlots) {
      const [sh, sm] = slot.split(':').map(Number)
      const sStart = sh * 60 + sm
      const sEnd = sStart + duration
      if (bStart < sEnd && sStart < bEnd) blocked.add(slot)
    }
  }

  // Block slots overlapping with break time
  if (settings.break_enabled === 'true' && settings.break_start && settings.break_end) {
    const [bkSh, bkSm] = settings.break_start.split(':').map(Number)
    const [bkEh, bkEm] = settings.break_end.split(':').map(Number)
    const bkStart = bkSh * 60 + bkSm
    const bkEnd = bkEh * 60 + bkEm
    for (const slot of allSlots) {
      const [sh, sm] = slot.split(':').map(Number)
      const sStart = sh * 60 + sm
      const sEnd = sStart + duration
      if (bkStart < sEnd && sStart < bkEnd) blocked.add(slot)
    }
  }

  const maxStart = endMins - duration

  // For today: block slots that have already passed (nowMins passed from client to avoid timezone issues)
  const nowParam = request.nextUrl.searchParams.get('now') // HH:MM in local time
  const nowMins = nowParam ? (() => { const [h, m] = nowParam.split(':').map(Number); return h * 60 + m })() : 0

  const slots = allSlots
    .filter(slot => {
      const [h, m] = slot.split(':').map(Number)
      const slotMins = h * 60 + m
      return slotMins <= maxStart && slotMins > nowMins
    })
    .map(slot => ({ time: slot, available: !blocked.has(slot) }))

  return Response.json({ slots })
}
