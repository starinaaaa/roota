import type { Metadata } from 'next'
import CartPageContent from '@/components/cart/CartPageContent'

export const metadata: Metadata = {
  title: 'Корзина',
}

export default function CartPage() {
  return (
    <div className="pt-16 md:pt-20 min-h-screen">
      <CartPageContent />
    </div>
  )
}
