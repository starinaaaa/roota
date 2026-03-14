'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatPrice } from '@/lib/products'

type Props = {
  productName: string
  price: number
  onAddToCart: () => void
}

export default function StickyCartBar({ productName, price, onAddToCart }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 400)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed bottom-0 left-0 right-0 z-40 bg-stone-50/95 backdrop-blur-sm border-t border-stone-200"
        >
          <div className="h-16 px-6 md:px-12 lg:px-16 flex items-center justify-between gap-4">

            {/* Left: name + price */}
            <div className="flex items-center gap-4 min-w-0">
              <span className="hidden md:block font-body text-sm text-stone-500 truncate max-w-xs">
                {productName}
              </span>
              <span className="font-display text-lg text-stone-900 shrink-0">
                {formatPrice(price)}
              </span>
            </div>

            {/* Right: button */}
            <button
              onClick={onAddToCart}
              className="shrink-0 bg-stone-900 text-stone-50 font-body text-xs tracking-widest uppercase px-6 py-2.5 hover:bg-stone-700 transition-colors duration-200"
            >
              В корзину
            </button>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
