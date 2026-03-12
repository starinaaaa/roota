'use client'

import { AnimatePresence, motion } from 'framer-motion'
import ProductCard from './ProductCard'
import type { Product } from '@/types'

type Props = {
  products: Product[]
}

export default function ProductGrid({ products }: Props) {
  if (products.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center justify-center py-32 text-center"
      >
        <p className="font-body text-[10px] tracking-[0.25em] uppercase text-stone-400 mb-4">
          В этой категории пока нет работ
        </p>
        <p className="font-display text-2xl text-stone-300">Скоро появятся</p>
      </motion.div>
    )
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={products.map(p => p.id).join('-')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-16"
      >
        {products.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} />
        ))}
      </motion.div>
    </AnimatePresence>
  )
}
