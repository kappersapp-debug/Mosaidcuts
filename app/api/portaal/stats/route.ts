export const dynamic = 'force-dynamic'

import { verifyPortalAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const todayStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).split(' ')[0]
  const [tyr, tmo, tdy] = todayStr.split('-').map(Number)

  // Monday of current week (using NL date)
  const todayNlDate = new Date(tyr, tmo - 1, tdy, 12, 0, 0)
  const day = todayNlDate.getDay()
  const diffToMon = (day === 0 ? -6 : 1 - day)
  const mondayNl = new Date(tyr, tmo - 1, tdy + diffToMon, 12, 0, 0)
  const sundayNl = new Date(tyr, tmo - 1, tdy + diffToMon + 6, 12, 0, 0)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const mondayStr = fmt(mondayNl)
  const sundayStr = fmt(sundayNl)

  const monthStart = `${tyr}-${String(tmo).padStart(2,'0')}-01`
  const monthEnd = `${tyr}-${String(tmo).padStart(2,'0')}-${String(new Date(tyr, tmo, 0).getDate()).padStart(2,'0')}`

  const [{ data: todayBookings }, { data: weekBookings }, { data: monthBookings }] = await Promise.all([
    supabaseAdmin.from('bookings').select('*').eq('date', todayStr),
    supabaseAdmin.from('bookings').select('price').gte('date', mondayStr).lte('date', sundayStr),
    supabaseAdmin.from('bookings').select('id').gte('date', monthStart).lte('date', monthEnd),
  ])

  const weekRevenue = (weekBookings ?? []).reduce((sum, b) => sum + (b.price ?? 0), 0)

  return Response.json({
    today: (todayBookings ?? []).length,
    week: (weekBookings ?? []).length,
    weekRevenue,
    monthCustomers: (monthBookings ?? []).length,
    todayBookings: todayBookings ?? [],
  })
}
