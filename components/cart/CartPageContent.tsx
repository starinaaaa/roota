'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ShoppingBag, ArrowRight } from 'lucide-react'
import { formatPrice } from '@/lib/products'
import CartLineItem from './CartLineItem'
import type { CartItem } from '@/types'

type Props = {
  initialItems: CartItem[]
}

export default function CartPageContent({ initialItems }: Props) {
  const totalPrice = initialItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  const totalItems = initialItems.reduce((sum, i) => sum + i.quantity, 0)

  if (initialItems.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-6"
      >
        <ShoppingBag size={40} strokeWidth={1} className="text-stone-200" />
        <h2 className="font-display text-3xl text-stone-800">Корзина пуста</h2>
        <p className="font-body text-sm text-stone-400 max-w-xs">
          Загляните в каталог — там точно что-нибудь понравится.
        </p>
        <Link
          href="/catalog"
          className="
            mt-2 font-body text-[10px] tracking-[0.22em] uppercase
            border border-stone-300 text-stone-700 px-8 py-3.5
            hover:bg-stone-900 hover:text-stone-50 hover:border-stone-900
            transition-all duration-300 flex items-center gap-2
          "
        >
          Перейти в каталог
          <ArrowRight size={12} strokeWidth={1.5} />
        </Link>
      </motion.div>
    )
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 md:px-12 lg:px-16 py-12 md:py-16">
      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-16 xl:gap-24">

        {/* Список товаров */}
        <div>
          <h1 className="font-display text-[clamp(2rem,5vw,4rem)] text-stone-900 mb-10">
            Корзина
          </h1>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {initialItems.map((item, i) => (
              <motion.div
                key={item.product.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
              >
                <CartLineItem item={item} />
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Summary */}
        <div className="mt-12 lg:mt-0">
          <div className="lg:sticky lg:top-28">
            <h2 className="font-body text-[10px] tracking-[0.28em] uppercase text-stone-400 mb-8">
              Итого заказа
            </h2>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between">
                <span className="font-body text-sm text-stone-500">
                  Товаров: {totalItems}
                </span>
                <span className="font-body text-sm text-stone-700">
                  {formatPrice(totalPrice)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-body text-sm text-stone-500">Доставка</span>
                <span className="font-body text-sm text-stone-400">
                  рассчитывается при оформлении
                </span>
              </div>
              <div className="divider pt-1" />
              <div className="flex justify-between items-baseline">
                <span className="font-body text-xs tracking-[0.15em] uppercase text-stone-500">
                  К оплате
                </span>
                <span className="font-display text-2xl text-stone-900">
                  {formatPrice(totalPrice)}
                </span>
              </div>
            </div>

            <Link
              href="/checkout"
              className="
                block w-full text-center
                bg-stone-900 text-stone-50
                font-body text-xs tracking-[0.2em] uppercase
                py-4
                hover:bg-stone-700
                transition-colors duration-300
              "
            >
              Оформить заказ
            </Link>

            <Link
              href="/catalog"
              className="
                block w-full text-center mt-3
                font-body text-[10px] tracking-[0.18em] uppercase
                text-stone-400 hover:text-stone-700
                transition-colors duration-200
              "
            >
              Продолжить покупки
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
