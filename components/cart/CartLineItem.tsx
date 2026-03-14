'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Minus, Plus, X } from 'lucide-react'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/products'
import type { CartItem } from '@/types'

type Props = {
  item: CartItem
  compact?: boolean // компактный вид для drawer
}

export default function CartLineItem({ item, compact = false }: Props) {
  const { updateQuantity, removeItem } = useCart()

  const { product, quantity } = item
  const imgSrc = product.images?.[0] ?? null

  if (compact) {
    return (
      <div className="flex gap-4 py-5 border-b border-stone-100 last:border-b-0">
        {/* Фото */}
        <Link href={`/product/${product.slug}`} className="shrink-0">
          <div className="relative w-16 h-20 bg-stone-100 overflow-hidden">
            {imgSrc && (
              <Image
                src={imgSrc}
                alt={product.name}
                fill
                className="object-cover"
                sizes="64px"
              />
            )}
          </div>
        </Link>

        {/* Инфо */}
        <div className="flex flex-col flex-1 min-w-0 gap-2">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/product/${product.slug}`}
              className="font-body text-xs text-stone-800 leading-snug hover:text-stone-500 transition-colors duration-200 line-clamp-2"
            >
              {product.name}
            </Link>
            <button
              onClick={() => removeItem(product.id)}
              className="shrink-0 p-0.5 text-stone-300 hover:text-stone-700 transition-colors duration-200"
              aria-label="Удалить"
            >
              <X size={13} strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex items-center justify-between mt-auto">
            {/* Stepper */}
            <div className="flex items-center gap-0 border border-stone-200">
              <button
                onClick={() => updateQuantity(product.id, quantity - 1)}
                className="w-7 h-7 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors duration-150"
                aria-label="Уменьшить"
              >
                <Minus size={10} strokeWidth={1.5} />
              </button>
              <span className="w-7 h-7 flex items-center justify-center font-body text-xs text-stone-700 border-x border-stone-200">
                {quantity}
              </span>
              <button
                onClick={() => updateQuantity(product.id, quantity + 1)}
                className="w-7 h-7 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors duration-150"
                aria-label="Увеличить"
              >
                <Plus size={10} strokeWidth={1.5} />
              </button>
            </div>

            <p className="font-display text-base text-stone-900">
              {formatPrice(product.price * quantity)}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Полный вид (страница /cart) ──────────────────────────────────────────────
  return (
    <div className="flex gap-5 md:gap-7 py-7 border-b border-stone-100 last:border-b-0">
      {/* Фото */}
      <Link href={`/product/${product.slug}`} className="shrink-0">
        <div className="relative w-24 h-32 md:w-28 md:h-36 bg-stone-100 overflow-hidden">
          {imgSrc && (
            <Image
              src={imgSrc}
              alt={product.name}
              fill
              className="object-cover hover:scale-[1.03] transition-transform duration-500"
              sizes="(max-width: 768px) 96px, 112px"
            />
          )}
        </div>
      </Link>

      {/* Инфо */}
      <div className="flex flex-col flex-1 min-w-0 gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              href={`/product/${product.slug}`}
              className="font-body text-sm text-stone-800 hover:text-stone-500 transition-colors duration-200"
            >
              {product.name}
            </Link>
            <p className="font-display text-lg text-stone-900 mt-1">
              {formatPrice(product.price)}
            </p>
          </div>
          <button
            onClick={() => removeItem(product.id)}
            className="p-1 text-stone-300 hover:text-stone-700 transition-colors duration-200"
            aria-label="Удалить из корзины"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* Stepper + итого */}
        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-center gap-0 border border-stone-200">
            <button
              onClick={() => updateQuantity(product.id, quantity - 1)}
              className="w-8 h-8 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors duration-150"
              aria-label="Уменьшить"
            >
              <Minus size={11} strokeWidth={1.5} />
            </button>
            <span className="w-8 h-8 flex items-center justify-center font-body text-xs text-stone-700 border-x border-stone-200">
              {quantity}
            </span>
            <button
              onClick={() => updateQuantity(product.id, quantity + 1)}
              className="w-8 h-8 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors duration-150"
              aria-label="Увеличить"
            >
              <Plus size={11} strokeWidth={1.5} />
            </button>
          </div>

          <p className="font-display text-xl text-stone-900">
            {formatPrice(product.price * quantity)}
          </p>
        </div>
      </div>
    </div>
  )
}
