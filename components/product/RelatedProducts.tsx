'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { formatPrice } from '@/lib/products'
import type { Product } from '@/types'

type Props = {
  products: Product[]
}

export default function RelatedProducts({ products }: Props) {
  if (products.length === 0) return null

  return (
    <section className="px-6 md:px-12 lg:px-16 pb-20 md:pb-28">
      <div className="max-w-[1440px] mx-auto">

        <div className="divider mb-14" />

        <div className="flex items-baseline justify-between mb-10 md:mb-14">
          <h2 className="font-display text-[clamp(1.8rem,3.5vw,3rem)] text-stone-900">
            Другие работы
          </h2>
          <Link
            href="/catalog"
            className="hidden md:block font-body text-xs tracking-[0.15em] uppercase text-stone-400 hover:text-stone-900 transition-colors duration-200"
          >
            Весь каталог
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {products.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.55, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link href={`/product/${p.slug}`} className="group block">
                <div className="relative aspect-[3/4] overflow-hidden bg-stone-100 mb-4">
                  {p.images[0] && (
                    <Image
                      src={p.images[0]}
                      alt={p.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    />
                  )}
                  <div className="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/6 transition-colors duration-500" />
                </div>
                <p className="font-body text-xs text-stone-700 mb-0.5">{p.name}</p>
                <p className="font-display text-lg text-stone-900">{formatPrice(p.price)}</p>
              </Link>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  )
}
