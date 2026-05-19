export const dynamic = 'force-dynamic'

import { verifyPortalAuth, makeSessionToken } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { transporter } from '@/lib/mailer'
import { cancelMailHtml } from '@/app/api/bookings/cancel/route'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'

export async function GET() {
  const { data } = await supabaseAdmin.from('settings').select('key, value')

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    if (row.key !== 'portal_password' && row.key !== 'portal_password_hash') map[row.key] = row.value
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
              from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
              to: booking.email,
              subject: `Afspraak geannuleerd – ${booking.code}`,
              html: cancelMailHtml(booking),
            })
          } catch { /* non-fatal */ }
        }
      }
    }
  }

  // When service durations change, update future bookings so slots stay correct
  if (key === 'services') {
    const newServices: { id: string; name: string; duration: number }[] = JSON.parse(value ?? '[]')
    const { data: existing } = await supabaseAdmin.from('settings').select('value').eq('key', 'services').single()
    if (existing?.value) {
      const oldServices: { id: string; name: string; duration: number }[] = JSON.parse(existing.value)
      const today = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).split(' ')[0]
      for (const newSvc of newServices) {
        const oldSvc = oldServices.find(s => s.id === newSvc.id)
        if (oldSvc && oldSvc.duration !== newSvc.duration) {
          await supabaseAdmin
            .from('bookings')
            .update({ duration: newSvc.duration })
            .eq('service', newSvc.name)
            .gte('date', today)
        }
      }
    }
  }

  // If portal password is being changed, hash it and store as portal_password_hash
  if (key === 'portal_password') {
    const hash = await bcrypt.hash(value, 12)
    await supabaseAdmin
      .from('settings')
      .upsert({ key: 'portal_password_hash', value: hash, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    await supabaseAdmin.from('settings').delete().eq('key', 'portal_password')

    // Re-issue session cookie (token is fixed, but re-set for freshness)
    const token = makeSessionToken()
    const cookieStore = await cookies()
    cookieStore.set('portaal_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return Response.json({ success: true })
  }

  await supabaseAdmin.from('settings').upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )

  return Response.json({ success: true })
}
