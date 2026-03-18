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

  // Derive current cart qty from shared context — no extra fetch needed
  const cartItem = items.find(i => i.product_id === productId)
  const cartQty  = cartItem?.quantity ?? 0
  const atLimit  = stockQty != null && cartQty >= stockQty

  function stop(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleAdd(e: React.MouseEvent) {
    stop(e)
    addItem(productId, 1)
  }

  function handleDecrement(e: React.MouseEvent) {
    stop(e)
    updateQuantity(productId, cartQty - 1)
  }

  function handleIncrement(e: React.MouseEvent) {
    stop(e)
    if (!atLimit) updateQuantity(productId, cartQty + 1)
  }

  function handleModal(e: React.MouseEvent) {
    stop(e)
    setModal(true)
  }

  return (
    // stopPropagation on the whole block so clicks never bubble to the parent Link
    <div
      onClick={e => e.stopPropagation()}
      className="flex gap-2 mt-3"
    >
      {inStock ? (
        <>
          {/* ── В корзину / inline counter ── */}
          {cartQty > 0 ? (
            <div className="flex items-stretch flex-1 border border-stone-200">
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
                  atLimit
                    ? 'text-stone-200 cursor-not-allowed'
                    : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50',
                ].join(' ')}
                aria-label="Увеличить"
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              className="flex-1 bg-stone-900 text-stone-50 font-body text-[10px] tracking-[0.15em] uppercase px-3 py-2 hover:bg-stone-700 transition-colors duration-200"
            >
              В корзину
            </button>
          )}

          {/* ── Подробнее ── */}
          <Link
            href={`/product/${productSlug}`}
            onClick={e => e.stopPropagation()}
            className="flex-1 flex items-center justify-center border border-stone-300 text-stone-600 font-body text-[10px] tracking-[0.15em] uppercase px-3 py-2 hover:border-stone-600 transition-colors duration-200"
          >
            Подробнее
          </Link>
        </>
      ) : (
        <>
          {/* ── Уведомить ── */}
          <button
            onClick={handleModal}
            className="flex-1 border border-stone-300 text-stone-500 font-body text-[10px] tracking-[0.15em] uppercase px-3 py-2 hover:border-stone-500 transition-colors duration-200"
          >
            Уведомить
          </button>

          {/* ── Предзаказ ── */}
          <button
            onClick={handleModal}
            className="flex-1 border border-stone-300 text-stone-500 font-body text-[10px] tracking-[0.15em] uppercase px-3 py-2 hover:border-stone-500 transition-colors duration-200"
          >
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
