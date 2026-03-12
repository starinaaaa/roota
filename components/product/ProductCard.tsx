'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { formatPrice } from '@/lib/products'
import type { Product } from '@/types'

type Props = {
  product: Product
  index?: number
}

export default function ProductCard({ product, index = 0 }: Props) {
  const imgSrc = product.images?.[0] ?? null

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.65,
        delay: index * 0.07,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Link href={`/product/${product.slug}`} className="group block">
        {/* Изображение */}
        <div className="relative aspect-[3/4] overflow-hidden bg-stone-100 mb-5">

          {imgSrc ? (
            <Image
              src={imgSrc}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-stone-100 to-stone-200 flex items-end p-5">
              <span className="font-body text-[10px] text-stone-400 tracking-widest uppercase">
                Фото скоро
              </span>
            </div>
          )}

          {/* Статус: нет в наличии */}
          {!product.in_stock && (
            <div className="absolute top-4 left-4">
              <span className="font-body text-[9px] tracking-[0.18em] uppercase bg-stone-50/90 text-stone-400 px-2.5 py-1.5">
                Нет в наличии
              </span>
            </div>
          )}

          {/* Тёмный hover-оверлей */}
          <div className="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/6 transition-colors duration-500" />

          {/* Подсказка «Смотреть» */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 bg-stone-50/92 backdrop-blur-sm py-3 px-5"
            initial={{ y: '100%' }}
            whileHover={{ y: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="font-body text-[10px] tracking-[0.2em] uppercase text-stone-700">
              Смотреть изделие
            </span>
          </motion.div>
        </div>

        {/* Информация */}
        <div className="space-y-1.5">
          <p className="font-body text-[10px] tracking-[0.18em] uppercase text-stone-400 group-hover:text-stone-600 transition-colors duration-300">
            {product.category?.name}
          </p>
          <h3 className="font-body text-sm text-stone-800 group-hover:text-stone-900 transition-colors duration-200">
            {product.name}
          </h3>
          <p className="font-display text-lg text-stone-900">
            {formatPrice(product.price)}
          </p>
        </div>
      </Link>
    </motion.article>
  )
}
