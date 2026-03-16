'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { addToCart } from '@/lib/actions/cart'

type Props = {
  productId: string
  productName: string
}

export default function AddToCartButton({ productId, productName }: Props) {
  const [isPending, startTransition] = useTransition()
  const [added, setAdded] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear pending timer on unmount to avoid setState on an unmounted component
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (isPending || added) return

    startTransition(async () => {
      const result = await addToCart(productId)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (result.error) {
        setStockError(result.error)
        timerRef.current = setTimeout(() => setStockError(null), 3000)
      } else {
        setAdded(true)
        timerRef.current = setTimeout(() => setAdded(false), 1500)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      aria-label={`Добавить ${productName} в корзину`}
      className={[
        'border font-body text-[10px] tracking-[0.15em] uppercase px-3 py-1.5',
        'bg-white/90 backdrop-blur-sm transition-all duration-200',
        stockError
          ? 'border-red-400 text-red-600 bg-red-50/90'
          : added
          ? 'border-stone-700 text-stone-700'
          : 'border-stone-300 text-stone-700 hover:border-stone-700',
        isPending ? 'opacity-60 cursor-wait' : 'opacity-100',
      ].join(' ')}
    >
      {stockError ?? (added ? '✓' : 'В корзину')}
    </button>
  )
}
