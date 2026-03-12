import type { Metadata } from 'next'
import { Cormorant_Garamond, Jost } from 'next/font/google'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import CartDrawer from '@/components/cart/CartDrawer'
import './globals.css'

const cormorant = Cormorant_Garamond({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-cormorant',
  display: 'swap',
})

const jost = Jost({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500'],
  variable: '--font-jost',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Студия авторской керамики',
    template: '%s | Студия авторской керамики',
  },
  description:
    'Авторская керамика ручной работы. Тарелки, стаканы, вазы и декор — каждое изделие создано с заботой о деталях.',
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Студия авторской керамики',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className={`${cormorant.variable} ${jost.variable}`}>
      <body className="bg-stone-50 text-stone-900 antialiased">
        <Header />
        <main>{children}</main>
        <Footer />
        <CartDrawer />
      </body>
    </html>
  )
}
