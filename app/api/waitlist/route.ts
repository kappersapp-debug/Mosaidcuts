import { supabaseAdmin } from '@/lib/supabase'

const attempts = new Map<string, { count: number; lockedUntil: number }>()

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const entry = attempts.get(ip) ?? { count: 0, lockedUntil: 0 }

  if (entry.lockedUntil > now) {
    return Response.json({ error: 'Te veel pogingen. Probeer later opnieuw.' }, { status: 429 })
  }

  const { name, phone, email, preferred_date, service, note } = await request.json()
  if (!name || !preferred_date) {
    return Response.json({ error: 'Naam en datum zijn vereist' }, { status: 400 })
  }

  entry.count += 1
  if (entry.count >= 10) {
    entry.lockedUntil = now + 15 * 60 * 1000
    entry.count = 0
  }
  attempts.set(ip, entry)

  const { error } = await supabaseAdmin.from('waitlist').insert({
    name, phone: phone ?? '', email: email ?? '',
    preferred_date, service: service ?? '', note: note ?? '',
  })

  if (error) return Response.json({ error: 'Opslaan mislukt' }, { status: 500 })

  attempts.delete(ip)
  return Response.json({ success: true })
}
