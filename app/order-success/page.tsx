import type { Metadata } from 'next'
import Link from 'next/link'
import OrderSuccessClient from './OrderSuccessClient'

export const metadata: Metadata = {
  title: 'Заказ принят',
}

type Props = {
  searchParams: Promise<{ id?: string }>
}

export default async function OrderSuccessPage({ searchParams }: Props) {
  const params  = await searchParams
  const orderId = params.id ?? ''
  // Первые 8 символов UUID — достаточно для идентификации
  const shortId = orderId.slice(0, 8).toUpperCase()

  return (
    <div className="pt-16 md:pt-20 min-h-screen flex items-center">
      <div className="max-w-[1440px] w-full mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-32">
        <div className="max-w-md">

          {/* Анимированная галочка */}
          <OrderSuccessClient />

          {/* Текст */}
          <div className="space-y-4 mt-10">
            {shortId && (
              <p className="font-body text-[10px] tracking-[0.3em] uppercase text-stone-400">
                Заказ #{shortId}
              </p>
            )}
            <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-tight text-stone-900">
              Заказ принят
            </h1>
            <p className="font-body text-sm text-stone-500 leading-relaxed">
              Мы свяжемся с вами в течение 24 часов для подтверждения
              заказа и уточнения деталей доставки.
            </p>
            <p className="font-body text-sm text-stone-500">
              Спасибо, что выбираете Glina Studio.
            </p>
          </div>

          {/* Действия */}
          <div className="flex flex-col sm:flex-row gap-3 mt-12">
            <Link
              href="/catalog"
              className="
                font-body text-xs tracking-[0.2em] uppercase
                bg-stone-900 text-stone-50
                px-8 py-4 text-center
                hover:bg-stone-700 transition-colors duration-300
              "
            >
              Продолжить покупки
            </Link>
            <Link
              href="/"
              className="
                font-body text-xs tracking-[0.2em] uppercase
                border border-stone-200 text-stone-600
                px-8 py-4 text-center
                hover:border-stone-400 hover:text-stone-900 transition-all duration-300
              "
            >
              На главную
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
