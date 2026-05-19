import type { Metadata, Viewport } from 'next'
import { Nunito, Barlow, Bebas_Neue } from 'next/font/google'
import './globals.css'

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  weight: ['400', '500', '600', '700', '800', '900'],
})

const barlow = Barlow({
  subsets: ['latin'],
  variable: '--font-barlow',
  weight: ['400', '500', '600', '700'],
})

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  variable: '--font-bebas',
  weight: ['400'],
})

export const metadata: Metadata = {
  title: 'MoSaidCuts – Barbershop',
  description: 'Boek uw afspraak bij MoSaidCuts Barbershop',
}

export const viewport: Viewport = {
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${nunito.variable} ${barlow.variable} ${bebasNeue.variable}`}>
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  )
}
