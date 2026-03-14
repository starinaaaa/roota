import type { Metadata } from 'next'
import CartPageContent from '@/components/cart/CartPageContent'
import { getCart } from '@/lib/actions/cart'

export const metadata: Metadata = {
  title: 'Корзина',
}

export default async function CartPage() {
  const { items } = await getCart()
  return (
    <div className="pt-16 md:pt-20 min-h-screen">
      <CartPageContent initialItems={items} />
    </div>
  )
}
