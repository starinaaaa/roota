'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { formatPrice } from '@/lib/products'
import AddToCartButton from './AddToCartButton'
import type { Product } from '@/types'

type Props = {
  product: Product
  index?: number
}

export default function ProductCard({ product, index = 0 }: Props) {
  const [imageFailed, setImageFailed] = useState(false)
  const imgSrc = product.primary_image_url ?? null
  const hasImage = Boolean(imgSrc) && !imageFailed

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.65,
        delay: index * 0.07,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="h-full"
    >
      <Link href={`/product/${product.slug}`} className="group flex h-full flex-col">
        {/* Изображение */}
        <div className="relative mb-5 aspect-square overflow-hidden rounded-lg bg-stone-100">
          {hasImage ? (
            <Image
              src={imgSrc!}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-br from-stone-100 via-stone-100 to-stone-200 p-5">
              <span className="font-body text-[10px] tracking-[0.24em] uppercase text-stone-300">
                Roota ceramics
              </span>
              <span className="font-body text-[10px] tracking-[0.18em] uppercase text-stone-400">
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

          {/* Кнопка «В корзину» — скрыта на десктопе, видна при наведении */}
          {product.in_stock && (
            <div className="absolute bottom-2 left-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
              <AddToCartButton productId={product.id} productName={product.name} />
            </div>
          )}

          {/* Подсказка «Смотреть» */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 bg-stone-50/92 px-5 py-3 backdrop-blur-sm"
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
          <p className="min-h-[1rem] font-body text-[10px] tracking-[0.18em] uppercase text-stone-400 transition-colors duration-300 group-hover:text-stone-600">
            {product.category?.name ?? ''}
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
