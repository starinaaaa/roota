'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import { formatPrice } from '@/lib/products'
import type { Product } from '@/types'

type Props = {
  product: Product
  onAddToCart: () => void
  added: boolean
}

export default function ProductInfo({ product, onAddToCart, added }: Props) {
  const [careOpen,  setCareOpen]  = useState(false)
  const [craftOpen, setCraftOpen] = useState(false)

  return (
    <div className="flex flex-col gap-8">

      {/* Категория + название */}
      <div className="space-y-3">
        {product.category && (
          <p className="font-body text-[10px] tracking-[0.25em] uppercase text-stone-400">
            {product.category.name}
          </p>
        )}
        <h1 className="font-display text-[clamp(2.2rem,4vw,3.5rem)] leading-tight text-stone-900">
          {product.name}
        </h1>
        <p className="font-display text-2xl text-stone-900">
          {formatPrice(product.price)}
        </p>
      </div>

      {/* Описание */}
      {product.description && (
        <p className="font-body text-sm text-stone-500 leading-relaxed max-w-sm">
          {product.description}
        </p>
      )}

      {/* Характеристики */}
      <ProductSpecs product={product} />

      {/* CTA */}
      <div className="flex flex-col gap-3 pt-2">
        {product.in_stock ? (
          <>
            <button
              onClick={onAddToCart}
              className={[
                'w-full font-body text-xs tracking-[0.2em] uppercase py-4 px-8',
                'transition-all duration-300 flex items-center justify-center gap-2',
                added
                  ? 'bg-stone-700 text-stone-50'
                  : 'bg-stone-900 text-stone-50 hover:bg-stone-700',
              ].join(' ')}
            >
              <AnimatePresence mode="wait">
                {added ? (
                  <motion.span
                    key="added"
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Check size={13} strokeWidth={1.8} />
                    Добавлено
                  </motion.span>
                ) : (
                  <motion.span
                    key="add"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    Добавить в корзину
                  </motion.span>
                )}
              </AnimatePresence>
            </button>

            <button className="
              w-full border border-stone-300 text-stone-700
              font-body text-xs tracking-[0.2em] uppercase
              py-4 px-8
              hover:bg-stone-900 hover:text-stone-50 hover:border-stone-900
              transition-all duration-300
            ">
              Написать мастеру
            </button>
          </>
        ) : (
          <>
            <button
              disabled
              className="
                w-full border border-stone-200 text-stone-300
                font-body text-xs tracking-[0.2em] uppercase
                py-4 px-8 cursor-not-allowed
              "
            >
              Нет в наличии
            </button>
            <button className="
              w-full border border-stone-300 text-stone-700
              font-body text-xs tracking-[0.2em] uppercase
              py-4 px-8
              hover:bg-stone-900 hover:text-stone-50 hover:border-stone-900
              transition-all duration-300
            ">
              Уведомить о поступлении
            </button>
          </>
        )}
      </div>

      {/* Разделитель */}
      <div className="divider" />

      {/* Уход за изделием — аккордеон */}
      <Accordion
        label="Уход за изделием"
        open={careOpen}
        onToggle={() => setCareOpen(v => !v)}
      >
        Рекомендуется ручная мойка тёплой водой. Изделие не предназначено
        для использования в микроволновой печи. Избегайте резких
        перепадов температур — это может повредить глазурь.
      </Accordion>

      {/* Ручная работа */}
      <Accordion
        label="Ручная работа"
        open={craftOpen}
        onToggle={() => setCraftOpen(v => !v)}
      >
        Каждое изделие создаётся вручную — след инструментов и пальцев
        мастера остаётся в форме. Незначительные отличия в размере и оттенке
        — часть характера авторской керамики, а не дефект.
      </Accordion>

    </div>
  )
}

/* ── ProductSpecs ───────────────────────────────────────────────────────────── */
function ProductSpecs({ product }: { product: Product }) {
  const rows: { label: string; value: string }[] = []

  if (product.material != null)
    rows.push({ label: 'Материал', value: product.material })
  if (product.dimensions != null)
    rows.push({ label: 'Размер', value: product.dimensions })
  if (product.weight != null)
    rows.push({ label: 'Вес', value: product.weight })
  if (product.dishwasher_safe != null)
    rows.push({ label: 'Посудомоечная машина', value: product.dishwasher_safe ? 'Можно' : 'Нельзя' })
  if (product.microwave_safe != null)
    rows.push({ label: 'Микроволновая печь', value: product.microwave_safe ? 'Можно' : 'Нельзя' })

  if (rows.length === 0) return null

  return (
    <div className="mt-6 mb-6">
      <div className="divide-y divide-stone-100">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between py-3">
            <span className="font-body text-xs uppercase tracking-widest text-stone-400">{label}</span>
            <span className="font-body text-sm text-stone-700">{value}</span>
          </div>
        ))}
      </div>
      <p className="font-body text-xs text-stone-400 italic mt-4">
        Каждое изделие немного отличается — это часть ручной работы
      </p>
    </div>
  )
}

/* ── Accordion ─────────────────────────────────────────────────────────────── */
function Accordion({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-1 group"
      >
        <span className="font-body text-xs tracking-[0.18em] uppercase text-stone-600 group-hover:text-stone-900 transition-colors duration-200">
          {label}
        </span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.22 }}
          className="font-body text-base text-stone-400 leading-none"
        >
          +
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden font-body text-sm text-stone-500 leading-relaxed pt-3 pb-1"
          >
            {children}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="divider mt-4" />
    </div>
  )
}
