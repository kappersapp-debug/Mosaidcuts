import { verifyPortalAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }
  const host = req.headers.get('host') ?? ''
  const proto = host.startsWith('localhost') ? 'webcal' : 'webcal'
  const token = process.env.CRON_SECRET ?? ''
  return Response.json({ url: `${proto}://${host}/api/portaal/calendar?token=${token}` })
}
