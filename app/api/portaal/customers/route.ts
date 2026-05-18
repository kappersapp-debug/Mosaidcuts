import { verifyPortalAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('email, name, service, price, date, time, code')
    .order('date', { ascending: false })

  if (error) return Response.json({ error: 'Database fout' }, { status: 500 })

  const map = new Map<string, {
    email: string; name: string; visits: number; totalSpent: number
    lastDate: string; lastService: string; bookings: typeof data
  }>()

  for (const b of (data ?? []).filter(b => b.email)) {
    const key = b.email.toLowerCase()
    if (!map.has(key)) {
      map.set(key, { email: key, name: b.name, visits: 0, totalSpent: 0, lastDate: '', lastService: '', bookings: [] })
    }
    const c = map.get(key)!
    c.visits++
    c.totalSpent += b.price ?? 0
    c.bookings!.push(b)
    if (b.date > c.lastDate) {
      c.lastDate = b.date
      c.lastService = b.service
      c.name = b.name
    }
  }

  const customers = Array.from(map.values())
    .sort((a, b) => (b.lastDate > a.lastDate ? 1 : -1))

  return Response.json({ customers })
}
