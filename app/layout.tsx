import type { Metadata } from 'next'
import { Unbounded } from 'next/font/google'
import Header from '@/components/layout/Header'

const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500'],
  variable: '--font-display',
  display: 'swap',
})
import Footer from '@/components/layout/Footer'
import CartDrawer from '@/components/cart/CartDrawer'
import CookieBanner from '@/components/layout/CookieBanner'
import { CartUIProvider } from '@/contexts/CartUIContext'
import { getCart } from '@/lib/actions/cart'
import './globals.css'

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { items } = await getCart()
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <html lang="ru" className={unbounded.variable}>
      <body className="bg-stone-50 text-stone-900 antialiased">
        <CartUIProvider initialItems={items}>
          <Header cartCount={cartCount} />
          <main>{children}</main>
          <Footer />
          <CartDrawer />
          <CookieBanner />
        </CartUIProvider>
      </body>
    </html>
  )
}
