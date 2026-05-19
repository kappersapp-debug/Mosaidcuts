export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const duration = Number(searchParams.get('duration') ?? 30)

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'month required (YYYY-MM)' }, { status: 400 })
  }

  const [yr, mo] = month.split('-').map(Number)
  const lastDayNum = new Date(yr, mo, 0).getDate()
  const firstDay = `${month}-01`
  const lastDay = `${month}-${String(lastDayNum).padStart(2, '0')}`

  const [{ data: bookings }, { data: settingsRows }] = await Promise.all([
    supabaseAdmin.from('bookings').select('date, time, duration').gte('date', firstDay).lte('date', lastDay),
    supabaseAdmin.from('settings').select('key, value'),
  ])

  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) settings[row.key] = row.value

  const blockedDates: string[] = settings.blocked_dates ? JSON.parse(settings.blocked_dates) : []
  const result: Record<string, { available: number; total: number }> = {}

  const nowNlStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' })
  const todayNl = nowNlStr.split(' ')[0]
  const nowMinsToday = (() => { const [, t] = nowNlStr.split(' '); const [h, m] = t.split(':').map(Number); return h * 60 + m })()

  for (let d = 1; d <= lastDayNum; d++) {
    const ds = `${month}-${String(d).padStart(2, '0')}`
    const dow = new Date(ds + 'T12:00:00').getDay()

    if (blockedDates.includes(ds)) { result[ds] = { available: 0, total: 0 }; continue }

    let dayStart = '09:00', dayEnd = '17:00', isOpen = true
    let dayBreaks: { start: string; end: string }[] = []
    if (settings.day_schedule) {
      const sched: Record<string, { open: boolean; start: string; end: string; breaks?: { start: string; end: string }[] }> = JSON.parse(settings.day_schedule)
      const cfg = sched[String(dow)]
      if (!cfg?.open) { isOpen = false }
      else { dayStart = cfg.start ?? '09:00'; dayEnd = cfg.end ?? '17:00'; dayBreaks = cfg.breaks ?? [] }
    } else if (settings.availability) {
      const avail: Record<string, boolean> = JSON.parse(settings.availability)
      if (avail[String(dow)] === false) { isOpen = false }
      else if (settings.breaks) dayBreaks = JSON.parse(settings.breaks)
    } else if (settings.breaks) {
      dayBreaks = JSON.parse(settings.breaks)
    }

    if (!isOpen) { result[ds] = { available: 0, total: 0 }; continue }

    const [sh, sm] = dayStart.split(':').map(Number)
    const [eh, em] = dayEnd.split(':').map(Number)
    const slots: number[] = []
    for (let m = sh * 60 + sm; m + duration <= eh * 60 + em; m += 15) slots.push(m)

    const isToday = ds === todayNl
    const futureSlots = isToday ? slots.filter(s => s > nowMinsToday) : slots
    const total = futureSlots.length
    const dayBookings = (bookings ?? []).filter(b => b.date === ds)

    let available = 0
    for (const slotMin of futureSlots) {
      const slotEnd = slotMin + duration
      const occupied = dayBookings.some(b => {
        const [bh, bm] = b.time.split(':').map(Number)
        const bStart = bh * 60 + bm
        return bStart < slotEnd && slotMin < bStart + b.duration
      })
      const inBreak = dayBreaks.some(brk => {
        const [bsh, bsm] = brk.start.split(':').map(Number)
        const [beh, bem] = brk.end.split(':').map(Number)
        const brkStart = bsh * 60 + bsm
        const brkEnd = beh * 60 + bem
        return brkStart < slotEnd && slotMin < brkEnd
      })
      if (!occupied && !inBreak) available++
    }

    result[ds] = { available, total }
  }

  return Response.json({ days: result })
}
