import { cookies } from 'next/headers'

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.set('portaal_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return Response.json({ success: true })
}
