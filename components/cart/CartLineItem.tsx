'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Minus, Plus, X } from 'lucide-react'
import { formatPrice } from '@/lib/products'
import type { CartItem } from '@/types'

type Props = {
  item: CartItem
  compact?: boolean // компактный вид для drawer
  onUpdate: (productId: string, qty: number) => void
  onRemove: (productId: string) => void
}

export default function CartLineItem({ item, compact = false, onUpdate, onRemove }: Props) {
  const { product, quantity } = item
  const imgSrc = product.images?.[0] ?? null

  // Disable + when cart already holds every available unit
  const atStockLimit = product.stock_qty != null && quantity >= product.stock_qty

  if (compact) {
    return (
      <div className="flex gap-4 py-5 border-b border-stone-100 last:border-b-0">

        {/* Фото */}
        <Link href={`/product/${product.slug}`} className="shrink-0">
          <div className="relative w-20 h-24 bg-stone-100 overflow-hidden">
            {imgSrc && (
              <Image
                src={imgSrc}
                alt={product.name}
                fill
                className="object-cover hover:scale-[1.03] transition-transform duration-500"
                sizes="80px"
              />
            )}
          </div>
        </Link>

        {/* Инфо */}
        <div className="flex flex-col flex-1 min-w-0 gap-2.5">

          {/* Верхняя строка: название + цена + удалить */}
          <div className="flex items-start justify-between gap-3">
            <Link
              href={`/product/${product.slug}`}
              className="font-body text-[11px] text-stone-700 leading-snug hover:text-stone-400 transition-colors duration-200 line-clamp-2"
            >
              {product.name}
            </Link>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="font-display text-sm text-stone-900">
                {formatPrice(product.price * quantity)}
              </span>
              <button
                onClick={() => onRemove(product.id)}
                className="text-stone-300 hover:text-stone-600 transition-colors duration-150 p-0.5"
                aria-label="Удалить"
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Нижняя строка: степпер */}
          <div className="flex items-center gap-3 mt-auto">
            <button
              onClick={() => onUpdate(product.id, quantity - 1)}
              className="w-6 h-6 flex items-center justify-center text-stone-400 hover:text-stone-800 transition-colors duration-150"
              aria-label="Уменьшить"
            >
              <Minus size={9} strokeWidth={1.5} />
            </button>

            <span className="font-body text-xs text-stone-600 w-4 text-center tabular-nums">
              {quantity}
            </span>

            <button
              onClick={() => !atStockLimit && onUpdate(product.id, quantity + 1)}
              disabled={atStockLimit}
              className={[
                'w-6 h-6 flex items-center justify-center transition-colors duration-150',
                atStockLimit
                  ? 'text-stone-200 cursor-not-allowed'
                  : 'text-stone-400 hover:text-stone-800',
              ].join(' ')}
              aria-label="Увеличить"
            >
              <Plus size={9} strokeWidth={1.5} />
            </button>

            {atStockLimit && (
              <span className="font-body text-[8px] tracking-[0.14em] uppercase text-stone-300">
                Макс.
              </span>
            )}
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
            onClick={() => onRemove(product.id)}
            className="p-1 text-stone-300 hover:text-stone-700 transition-colors duration-200"
            aria-label="Удалить из корзины"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* Stepper + итого */}
        <div className="flex items-center justify-between mt-auto">
          <div className="flex flex-col items-start gap-1.5">
            <div className="flex items-center gap-0 border border-stone-200">
              <button
                onClick={() => onUpdate(product.id, quantity - 1)}
                className="w-8 h-8 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors duration-150"
                aria-label="Уменьшить"
              >
                <Minus size={11} strokeWidth={1.5} />
              </button>
              <span className="w-8 h-8 flex items-center justify-center font-body text-xs text-stone-700 border-x border-stone-200">
                {quantity}
              </span>
              <button
                onClick={() => !atStockLimit && onUpdate(product.id, quantity + 1)}
                disabled={atStockLimit}
                className={[
                  'w-8 h-8 flex items-center justify-center transition-colors duration-150',
                  atStockLimit
                    ? 'text-stone-200 cursor-not-allowed'
                    : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100',
                ].join(' ')}
                aria-label="Увеличить"
              >
                <Plus size={11} strokeWidth={1.5} />
              </button>
            </div>
            {atStockLimit && (
              <span className="font-body text-[10px] tracking-[0.12em] uppercase text-stone-400">
                Макс. в наличии
              </span>
            )}
          </div>

          <p className="font-display text-xl text-stone-900">
            {formatPrice(product.price * quantity)}
          </p>
        </div>
      </div>
    </div>
  )
}
