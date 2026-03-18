'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
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
            transition={{ duration: 0.3 }}
            onClick={closeDrawer}
            className="fixed inset-0 z-[59] bg-stone-900/15 backdrop-blur-[2px]"
          />

          {/* Панель — width ×1.5: 440 → 660px */}
          <motion.div
            key="cart-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="
              fixed top-0 right-0 bottom-0 z-[60]
              w-full sm:w-[660px]
              bg-white flex flex-col
            "
          >
            {/* ── Header — padding ×1.5: px-7→px-[42px], py-5→py-[30px] ── */}
            <div className="flex items-center justify-between shrink-0 px-[42px] py-[30px] border-b border-stone-100">
              <p className="font-body text-[14px] tracking-[0.28em] uppercase text-stone-500">
                {totalItems > 0
                  ? `${totalItems} ${plural(totalItems, 'предмет', 'предмета', 'предметов')} в корзине`
                  : 'Корзина'}
              </p>
              <button
                onClick={closeDrawer}
                aria-label="Закрыть корзину"
                className="font-body text-[14px] tracking-[0.22em] uppercase text-stone-400 hover:text-stone-900 transition-colors duration-200"
              >
                •закрыть•
              </button>
            </div>

            {/* ── Тело — padding ×1.5: px-7→px-[42px] ── */}
            <div className="flex-1 overflow-y-auto px-[42px]">
              {items.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12, duration: 0.35 }}
                  className="flex flex-col items-start justify-center h-full gap-9 py-20"
                >
                  <p className="font-display text-6xl text-stone-200 leading-none">
                    Пусто
                  </p>
                  <Link
                    href="/catalog"
                    onClick={closeDrawer}
                    className="flex items-center gap-3 font-body text-[14px] tracking-[0.24em] uppercase text-stone-400 hover:text-stone-900 transition-colors duration-200"
                  >
                    Перейти в каталог
                    <ArrowRight size={15} strokeWidth={1.5} />
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

            {/* ── Footer — padding ×1.5: px-7→px-[42px], pb-8→pb-12, pt-5→pt-[30px] ── */}
            {items.length > 0 && (
              <div className="shrink-0 px-[42px] pb-12 pt-[30px] border-t border-stone-100">

                {/* Итого — mb-6→mb-9, text ×1.5 */}
                <div className="flex items-baseline justify-between mb-9">
                  <span className="font-body text-[14px] tracking-[0.28em] uppercase text-stone-400">
                    Итого
                  </span>
                  <span className="font-body text-[20px] tracking-[0.04em] text-stone-900 tabular-nums">
                    {formatPrice(totalPrice)}
                  </span>
                </div>

                {/* Кнопка оформления — text ×1.5: 1.6rem→2.4rem, arrow ×1.5: 20→30 */}
                <button
                  onClick={handleCheckout}
                  className="
                    w-full flex items-center justify-between
                    border-t border-stone-900 pt-7
                    group
                  "
                >
                  <span className="font-display text-[2.4rem] leading-tight text-stone-900 group-hover:text-stone-500 transition-colors duration-300">
                    Оформить заказ
                  </span>
                  <motion.span
                    className="text-stone-900 group-hover:text-stone-500 transition-colors duration-300"
                    whileHover={{ x: 4 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    <ArrowRight size={30} strokeWidth={1.2} />
                  </motion.span>
                </button>

              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ── helpers ─────────────────────────────────────────────────────────────────── */
function plural(n: number, one: string, few: string, many: string) {
  const mod10  = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
