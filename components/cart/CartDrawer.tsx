'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ShoppingBag, ArrowRight } from 'lucide-react'
import { useCartUI } from '@/contexts/CartUIContext'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/products'
import CartLineItem from './CartLineItem'

export default function CartDrawer() {
  const { isOpen, close: closeDrawer } = useCartUI()
  const router = useRouter()
  const { items, updateQuantity, removeItem } = useCart()

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  const totalPrice = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0)

  function handleCheckout() {
    closeDrawer()
    router.push('/checkout')
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cart-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            onClick={closeDrawer}
            className="fixed inset-0 z-[59] bg-stone-900/25"
          />

          {/* Панель */}
          <motion.div
            key="cart-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="
              fixed top-0 right-0 bottom-0 z-[60]
              w-full sm:w-[400px]
              bg-stone-50 flex flex-col
              shadow-2xl shadow-stone-900/10
            "
          >
            {/* Header */}
            <div className="
              flex items-center justify-between shrink-0
              h-16 md:h-20 px-6
              border-b border-stone-100
            ">
              <p className="font-body text-[10px] tracking-[0.25em] uppercase text-stone-500">
                Корзина
                {totalItems > 0 && (
                  <span className="ml-2 text-stone-400">· {totalItems}</span>
                )}
              </p>
              <button
                onClick={closeDrawer}
                aria-label="Закрыть корзину"
                className="p-2 -mr-2 text-stone-600 hover:opacity-55 transition-opacity duration-200"
              >
                <X size={18} strokeWidth={1.4} />
              </button>
            </div>

            {/* Тело: список товаров или empty state */}
            <div className="flex-1 overflow-y-auto px-6">
              {items.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                  className="flex flex-col items-center justify-center h-full gap-5 py-20 text-center"
                >
                  <ShoppingBag size={32} strokeWidth={1} className="text-stone-200" />
                  <p className="font-body text-sm text-stone-400">
                    Корзина пуста
                  </p>
                  <Link
                    href="/catalog"
                    onClick={closeDrawer}
                    className="font-body text-[10px] tracking-[0.2em] uppercase text-stone-500 hover:text-stone-900 flex items-center gap-1.5 transition-colors duration-200"
                  >
                    Перейти в каталог
                    <ArrowRight size={11} strokeWidth={1.5} />
                  </Link>
                </motion.div>
              ) : (
                <div>
                  {items.map(item => (
                    <CartLineItem
                      key={item.product.id}
                      item={item}
                      compact
                      onUpdate={updateQuantity}
                      onRemove={removeItem}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer: итого + кнопка оформления */}
            {items.length > 0 && (
              <div className="shrink-0 px-6 pb-8 pt-5 border-t border-stone-100 space-y-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-body text-[10px] tracking-[0.2em] uppercase text-stone-500">
                    Итого
                  </span>
                  <span className="font-display text-2xl text-stone-900">
                    {formatPrice(totalPrice)}
                  </span>
                </div>

                <button
                  onClick={handleCheckout}
                  className="
                    w-full bg-stone-900 text-stone-50
                    font-body text-xs tracking-[0.2em] uppercase
                    py-4
                    hover:bg-stone-700
                    transition-colors duration-300
                    flex items-center justify-center gap-2
                  "
                >
                  Оформить заказ
                  <ArrowRight size={13} strokeWidth={1.5} />
                </button>

                <Link
                  href="/cart"
                  onClick={closeDrawer}
                  className="block text-center font-body text-[10px] tracking-[0.18em] uppercase text-stone-400 hover:text-stone-700 transition-colors duration-200"
                >
                  Открыть корзину
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
