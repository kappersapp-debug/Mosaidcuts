import { verifyPortalAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('waitlist')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: 'Database fout' }, { status: 500 })
  return Response.json({ waitlist: data ?? [] })
}

export async function DELETE(request: Request) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { id } = await request.json()
  if (!id) return Response.json({ error: 'id vereist' }, { status: 400 })

  await supabaseAdmin.from('waitlist').delete().eq('id', id)
  return Response.json({ success: true })
}
