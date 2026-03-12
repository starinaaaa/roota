'use client'

import { useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useInView } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import type { Product } from '@/types'

// ─── Mock-данные (удалить после подключения Supabase) ─────────────────────────
const MOCK_PRODUCTS: Pick<Product, 'id' | 'name' | 'slug' | 'price' | 'images'>[] = [
  {
    id: 'mock-1',
    name: 'Тарелка «Туман»',
    slug: 'tarelka-tuman',
    price: 3200,
    images: ['/images/products/plate-fog.jpg'],
  },
  {
    id: 'mock-2',
    name: 'Стакан «Охра»',
    slug: 'stakan-ohra',
    price: 1800,
    images: ['/images/products/glass-ochre.jpg'],
  },
  {
    id: 'mock-3',
    name: 'Ваза «Береста»',
    slug: 'vaza-beresta',
    price: 5600,
    images: ['/images/products/vase-bark.jpg'],
  },
  {
    id: 'mock-4',
    name: 'Блюдо «Соль»',
    slug: 'blyudo-sol',
    price: 4100,
    images: ['/images/products/plate-salt.jpg'],
  },
]
// ─────────────────────────────────────────────────────────────────────────────

interface FeaturedProductsProps {
  // В будущем сюда придут реальные товары с сервера
  products?: Pick<Product, 'id' | 'name' | 'slug' | 'price' | 'images'>[]
}

export default function FeaturedProducts({ products = MOCK_PRODUCTS }: FeaturedProductsProps) {
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
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
  product: Pick<Product, 'id' | 'name' | 'slug' | 'price' | 'images'>
  index: number
  inView: boolean
}) {
  const imgSrc = product.images?.[0] ?? null

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
        <div className="relative aspect-[3/4] overflow-hidden bg-stone-100 mb-4">

          {imgSrc ? (
            <Image
              src={imgSrc}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            // Placeholder пока нет реального фото
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
          <p className="font-body text-xs text-stone-400 tracking-[0.12em] uppercase group-hover:text-stone-600 transition-colors duration-300">
            {product.name}
          </p>
          <p className="font-display text-xl text-stone-900">
            {formatPrice(product.price)}
          </p>
        </div>

      </Link>
    </motion.div>
  )
}

/* ── Форматирование цены ── */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}
