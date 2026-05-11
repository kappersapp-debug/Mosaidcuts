import { verifyPortalAuth, makeSessionToken } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { transporter } from '@/lib/mailer'
import { cancelMailHtml } from '@/app/api/bookings/cancel/route'
import { cookies } from 'next/headers'

export async function GET() {
  const { data } = await supabaseAdmin.from('settings').select('key, value')

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    if (row.key !== 'portal_password') map[row.key] = row.value
  }

  return Response.json({ settings: map })
}

export async function POST(request: Request) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { key, value } = await request.json()
  if (!key) return Response.json({ error: 'key vereist' }, { status: 400 })

  // Auto-cancel bookings on newly blocked dates
  if (key === 'blocked_dates') {
    const newDates: string[] = JSON.parse(value ?? '[]')
    const { data: existing } = await supabaseAdmin.from('settings').select('value').eq('key', 'blocked_dates').single()
    const oldDates: string[] = existing ? JSON.parse(existing.value ?? '[]') : []
    const added = newDates.filter(d => !oldDates.includes(d))

    if (added.length > 0) {
      const { data: affected } = await supabaseAdmin
        .from('bookings')
        .select('id, email, name, code, service, date, time')
        .in('date', added)

      if (affected && affected.length > 0) {
        await supabaseAdmin.from('bookings').delete().in('date', added)
        for (const booking of affected) {
          try {
            await transporter.sendMail({
              to: booking.email,
              subject: `Afspraak geannuleerd – ${booking.code}`,
              html: cancelMailHtml(booking),
            })
          } catch { /* non-fatal */ }
        }
      }
    }
  }

  await supabaseAdmin.from('settings').upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )

  // If password changed, re-issue session cookie
  if (key === 'portal_password') {
    const token = makeSessionToken(value)
    const cookieStore = await cookies()
    cookieStore.set('portaal_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    })
  }

  return Response.json({ success: true })
}
