'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import { useCart } from '@/hooks/useCart'
import StockLimitModal from './StockLimitModal'

type Props = {
  productId: string
  productSlug: string
  productName: string
  inStock: boolean
  stockQty: number | null
}

export default function CardActions({
  productId,
  productSlug,
  productName,
  inStock,
  stockQty,
}: Props) {
  const [modal, setModal] = useState(false)
  const { items, addItem, updateQuantity } = useCart()

  const cartItem = items.find(i => i.product_id === productId)
  const cartQty  = cartItem?.quantity ?? 0
  const atLimit  = stockQty != null && cartQty >= stockQty

  function stop(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleAdd(e: React.MouseEvent) { stop(e); addItem(productId, 1) }
  function handleDecrement(e: React.MouseEvent) { stop(e); updateQuantity(productId, cartQty - 1) }
  function handleIncrement(e: React.MouseEvent) { stop(e); if (!atLimit) updateQuantity(productId, cartQty + 1) }
  function handleModal(e: React.MouseEvent) { stop(e); setModal(true) }

  // Shared base for both buttons so heights are always identical
  const btnBase = 'flex-1 h-[36px] min-h-[36px] box-border flex items-center justify-center font-body text-[13px] tracking-[0.15em] uppercase px-3 py-0 transition-colors duration-200'

  return (
    <div
      onClick={e => e.stopPropagation()}
      className="flex gap-2 mt-3"
    >
      {inStock ? (
        <>
          {/* ── В корзину / inline counter ── */}
          {cartQty > 0 ? (
            <div className="flex items-stretch flex-1 min-h-[36px] border border-stone-200">
              <button
                onClick={handleDecrement}
                className="px-3 py-2 font-body text-[12px] text-stone-500 hover:text-stone-900 hover:bg-stone-50 transition-colors duration-150"
                aria-label="Уменьшить"
              >
                −
              </button>
              <span className="flex-1 flex items-center justify-center font-body text-[10px] tracking-[0.1em] text-stone-700 border-x border-stone-200 tabular-nums">
                {cartQty}
              </span>
              <button
                onClick={handleIncrement}
                disabled={atLimit}
                className={[
                  'px-3 py-2 font-body text-[12px] transition-colors duration-150',
                  atLimit ? 'text-stone-200 cursor-not-allowed' : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50',
                ].join(' ')}
                aria-label="Увеличить"
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              className={`${btnBase} bg-stone-900 text-stone-50 hover:bg-stone-700`}
            >
              В корзину
            </button>
          )}

          {/* ── Подробнее ── */}
          <Link
            href={`/product/${productSlug}`}
            onClick={e => e.stopPropagation()}
            className={`${btnBase} border border-stone-300 text-stone-900 hover:border-stone-900`}
          >
            Подробнее
          </Link>
        </>
      ) : (
        <>
          <button onClick={handleModal} className={`${btnBase} border border-stone-300 text-stone-500 hover:border-stone-500`}>
            Уведомить
          </button>
          <button onClick={handleModal} className={`${btnBase} border border-stone-300 text-stone-500 hover:border-stone-500`}>
            Предзаказ
          </button>
        </>
      )}

      <AnimatePresence>
        {modal && (
          <StockLimitModal
            productId={productId}
            productName={productName}
            availableQty={0}
            onClose={() => setModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
