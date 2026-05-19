import { verifyPortalAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  if (!(await verifyPortalAuth())) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }
  const host = req.headers.get('host') ?? ''
  const token = process.env.CRON_SECRET ?? ''
  const httpProto = host.startsWith('localhost') ? 'http' : 'https'
  const url = `webcal://${host}/api/portaal/calendar?token=${token}`
  const httpUrl = `${httpProto}://${host}/api/portaal/calendar?token=${token}`
  return Response.json({ url, httpUrl })
}
