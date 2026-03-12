import type { Metadata } from 'next'
import CheckoutForm from '@/components/checkout/CheckoutForm'

export const metadata: Metadata = {
  title: 'Оформление заказа',
}

export default function CheckoutPage() {
  return (
    <div className="pt-16 md:pt-20 min-h-screen">
      <CheckoutForm />
    </div>
  )
}
