'use client'

import { useState, useTransition } from 'react'
import { addToCart } from '@/lib/actions/cart'

type Props = {
  productId: string
  productName: string
}

export default function AddToCartButton({ productId, productName }: Props) {
  const [isPending, startTransition] = useTransition()
  const [added, setAdded] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (isPending || added) return

    startTransition(async () => {
      const result = await addToCart(productId)
      if (result.error) {
        setStockError(result.error)
        setTimeout(() => setStockError(null), 3000)
      } else {
        setAdded(true)
        setTimeout(() => setAdded(false), 1500)
      }
    })
  }

  const isError = Boolean(stockError)

  return (
    <button
      onClick={handleClick}
      aria-label={`Добавить ${productName} в корзину`}
      className={[
        'border font-body text-[10px] tracking-[0.15em] uppercase px-3 py-1.5',
        'bg-white/90 backdrop-blur-sm transition-all duration-200',
        isError
          ? 'border-red-400 text-red-600 bg-red-50/90'
          : added
          ? 'border-stone-700 text-stone-700'
          : 'border-stone-300 text-stone-700 hover:border-stone-700',
        isPending ? 'opacity-60 cursor-wait' : 'opacity-100',
      ].join(' ')}
    >
      {isError ? stockError : added ? '✓' : 'В корзину'}
    </button>
  )
}
