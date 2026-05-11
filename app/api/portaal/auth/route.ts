import { verifyPortalAuth } from '@/lib/auth'

export async function GET() {
  const ok = await verifyPortalAuth()
  return Response.json({ authenticated: ok })
}
