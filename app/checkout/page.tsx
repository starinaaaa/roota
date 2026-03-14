import type { Metadata } from 'next'
import CheckoutForm from '@/components/checkout/CheckoutForm'
import { getCart } from '@/lib/actions/cart'

export const metadata: Metadata = {
  title: 'Оформление заказа',
}

export default async function CheckoutPage() {
  const { items } = await getCart()
  return (
    <div className="pt-16 md:pt-20 min-h-screen">
      <CheckoutForm initialItems={items} />
    </div>
  )
}
