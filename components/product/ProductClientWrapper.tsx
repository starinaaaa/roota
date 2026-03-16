'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '@/hooks/useCart'
import ProductInfo from './ProductInfo'
import StockLimitModal from './StockLimitModal'
import type { Product } from '@/types'

type Props = {
  product: Product
  inCart?: boolean
}

// Shared motion config for the success toast
const TOAST_MOTION = {
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: 'easeOut' },
} as const

export default function ProductClientWrapper({ product, inCart = false }: Props) {
  // `added` reflects whether the product is known to be in the cart.
  // Initialised from server-side cart data (inCart prop) so the button
  // shows the correct state on page load (BUG 3).
  const [added, setAdded] = useState(inCart)
  const [showToast, setShowToast]     = useState(false)
  const [stockModal, setStockModal]   = useState<{ availableQty: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { addItem } = useCart()

  // Sync with fresh server data after router.refresh() completes
  useEffect(() => { setAdded(inCart) }, [inCart])

  // Clear pending timer on unmount to avoid setState on an unmounted component
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  function handleAddToCart() {
    addItem(
      product.id,
      1,
      () => {
        // Success — mark as added (persists until server confirms via inCart sync)
        setAdded(true)
        // Show brief confirmation toast
        if (timerRef.current) clearTimeout(timerRef.current)
        setShowToast(true)
        timerRef.current = setTimeout(() => setShowToast(false), 2000)
      },
      (msg) => {
        // Stock error — open StockLimitModal instead of a red toast
        const match = msg.match(/(\d+)/)
        const availableQty = match ? parseInt(match[1], 10) : 0
        setStockModal({ availableQty })
      },
    )
  }

  return (
    <>
      <ProductInfo product={product} onAddToCart={handleAddToCart} added={added} />

      {/* Toast: добавлено */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            {...TOAST_MOTION}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-stone-50 font-body text-xs tracking-[0.18em] uppercase px-5 py-3 shadow-md whitespace-nowrap"
          >
            Добавлено в корзину ✓
          </motion.div>
        )}
      </AnimatePresence>

      {/* StockLimitModal: вместо красного тоста при ошибке наличия */}
      <AnimatePresence>
        {stockModal && (
          <StockLimitModal
            productId={product.id}
            productName={product.name}
            availableQty={stockModal.availableQty}
            onClose={() => setStockModal(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
