'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '@/hooks/useCart'
import ProductInfo from './ProductInfo'
import type { Product } from '@/types'

type Props = {
  product: Product
}

// Shared motion config for both toast variants
const TOAST_MOTION = {
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: 'easeOut' },
} as const

export default function ProductClientWrapper({ product }: Props) {
  const [added, setAdded] = useState(false)
  const [cartError, setCartError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { addItem } = useCart()

  // Clear pending timer on unmount to avoid setState on an unmounted component
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  function handleAddToCart() {
    addItem(
      product.id,
      1,
      () => {
        if (timerRef.current) clearTimeout(timerRef.current)
        setAdded(true)
        timerRef.current = setTimeout(() => setAdded(false), 2000)
      },
      (msg) => {
        if (timerRef.current) clearTimeout(timerRef.current)
        setCartError(msg)
        timerRef.current = setTimeout(() => setCartError(null), 3000)
      },
    )
  }

  return (
    <>
      <ProductInfo product={product} onAddToCart={handleAddToCart} added={added} />

      {/* Toast: добавлено */}
      <AnimatePresence>
        {added && (
          <motion.div
            {...TOAST_MOTION}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-stone-50 font-body text-xs tracking-[0.18em] uppercase px-5 py-3 shadow-md whitespace-nowrap"
          >
            Добавлено в корзину ✓
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast: ошибка наличия */}
      <AnimatePresence>
        {cartError && (
          <motion.div
            {...TOAST_MOTION}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white font-body text-xs tracking-[0.15em] px-5 py-3 shadow-md whitespace-nowrap"
          >
            {cartError}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
