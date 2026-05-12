import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest } from 'next/server'

const attempts = new Map<string, { count: number; resetAt: number }>()

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const entry = attempts.get(ip) ?? { count: 0, resetAt: now + 60 * 1000 }

  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60 * 1000 }
  entry.count += 1
  attempts.set(ip, entry)

  if (entry.count > 10) {
    return Response.json({ error: 'Te veel pogingen. Probeer later opnieuw.' }, { status: 429 })
  }

  const code = request.nextUrl.searchParams.get('code')?.toUpperCase().trim()
  const email = request.nextUrl.searchParams.get('email')?.toLowerCase().trim()

  if (!code || !email) return Response.json({ error: 'Afspraak niet gevonden' }, { status: 404 })
  if (!/^MSC[A-Z0-9]{5}$/.test(code)) {
    return Response.json({ error: 'Afspraak niet gevonden' }, { status: 404 })
  }

  const { data } = await supabaseAdmin
    .from('bookings')
    .select('code, service, price, date, time, name, email')
    .eq('code', code)
    .single()

  if (!data || data.email.toLowerCase() !== email) {
    return Response.json({ error: 'Afspraak niet gevonden' }, { status: 404 })
  }

  // Don't return the email in the response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { email: _email, ...booking } = data
  return Response.json({ booking })
}
