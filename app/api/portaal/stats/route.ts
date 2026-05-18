import { verifyPortalAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // Monday of current week
  const day = today.getDay()
  const diffToMon = (day === 0 ? -6 : 1 - day)
  const monday = new Date(today)
  monday.setDate(today.getDate() + diffToMon)
  const mondayStr = monday.toISOString().split('T')[0]

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const sundayStr = sunday.toISOString().split('T')[0]

  const [{ data: todayBookings }, { data: weekBookings }, { data: allBookings }] = await Promise.all([
    supabaseAdmin.from('bookings').select('*').eq('date', todayStr),
    supabaseAdmin.from('bookings').select('price').gte('date', mondayStr).lte('date', sundayStr),
    supabaseAdmin.from('bookings').select('email'),
  ])

  const weekRevenue = (weekBookings ?? []).reduce((sum, b) => sum + (b.price ?? 0), 0)
  const uniqueEmails = new Set((allBookings ?? []).map(b => b.email).filter(Boolean)).size

  return Response.json({
    today: (todayBookings ?? []).length,
    week: (weekBookings ?? []).length,
    weekRevenue,
    totalCustomers: uniqueEmails,
    todayBookings: todayBookings ?? [],
  })
}
