'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useInView } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { formatPrice } from '@/lib/products'
import type { Product } from '@/types'

interface FeaturedProductsProps {
  products: Pick<Product, 'id' | 'name' | 'slug' | 'price' | 'primary_image_url'>[]
}

export default function FeaturedProducts({ products }: FeaturedProductsProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const inView = useInView(sectionRef, { once: true, margin: '-60px' })

  return (
    <section
      ref={sectionRef}
      className="pb-28 md:pb-36 px-6 md:px-12 lg:px-16"
    >
      <div className="max-w-[1440px] mx-auto">

        {/* Шапка секции */}
        <div className="flex items-end justify-between mb-10 md:mb-14">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="font-display text-[clamp(2rem,4vw,3.5rem)] text-stone-900"
          >
            Избранное
          </motion.h2>

          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            <Link
              href="/catalog"
              className="group hidden md:flex items-center gap-2 font-body text-xs tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900 transition-colors duration-300"
            >
              Весь каталог
              <motion.span
                whileHover={{ x: 3 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <ArrowRight size={13} strokeWidth={1.5} />
              </motion.span>
            </Link>
          </motion.div>
        </div>

        {/* Сетка товаров */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product, i) => (
            <ProductCardFeatured
              key={product.id}
              product={product}
              index={i}
              inView={inView}
            />
          ))}
        </div>

        {/* Кнопка «Весь каталог» на мобильном */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-10 flex md:hidden justify-center"
        >
          <Link
            href="/catalog"
            className="
              font-body text-xs tracking-[0.18em] uppercase
              border border-stone-300 text-stone-700
              px-8 py-3.5
              hover:bg-stone-900 hover:text-stone-50 hover:border-stone-900
              transition-all duration-300
            "
          >
            Весь каталог
          </Link>
        </motion.div>

      </div>
    </section>
  )
}

/* ── Карточка товара ── */
function ProductCardFeatured({
  product,
  index,
  inView,
}: {
  product: Pick<Product, 'id' | 'name' | 'slug' | 'price' | 'primary_image_url'>
  index: number
  inView: boolean
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const imgSrc = product.primary_image_url ?? null
  const hasImage = Boolean(imgSrc) && !imageFailed

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.65,
        delay: 0.1 + index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Link href={`/product/${product.slug}`} className="group block">

        {/* Изображение */}
        <div className="relative aspect-square overflow-hidden rounded-lg bg-stone-100 mb-4">
          {hasImage ? (
            <Image
              src={imgSrc!}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-stone-100 to-stone-200 flex items-end p-4">
              <span className="font-body text-[10px] text-stone-400 tracking-widest uppercase">
                Фото скоро
              </span>
            </div>
          )}

          {/* Оверлей при hover */}
          <div className="
            absolute inset-0 bg-stone-900/0
            group-hover:bg-stone-900/8
            transition-colors duration-500
          " />


        </div>

        {/* Инфо */}
        <div className="space-y-1.5">
          <p className="font-body text-sm text-stone-400 tracking-[0.12em] uppercase group-hover:text-stone-600 transition-colors duration-300">
            {product.name}
          </p>
          <p className="font-display text-2xl text-stone-900">
            {formatPrice(product.price)}
          </p>
        </div>

      </Link>
    </motion.div>
  )
}
