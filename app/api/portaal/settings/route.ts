import { verifyPortalAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { makeSessionToken } from '@/lib/auth'
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
