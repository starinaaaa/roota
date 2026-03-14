'use client'

import { useState } from 'react'
import { useCart } from '@/hooks/useCart'
import ProductInfo from './ProductInfo'
import StickyCartBar from './StickyCartBar'
import type { Product } from '@/types'

type Props = {
  product: Product
}

export default function ProductClientWrapper({ product }: Props) {
  const [added, setAdded] = useState(false)
  const { addItem } = useCart()

  function handleAddToCart() {
    addItem(product.id)
    setAdded(true)
    setTimeout(() => setAdded(false), 1800)
  }

  return (
    <>
      <ProductInfo product={product} onAddToCart={handleAddToCart} added={added} />
      <StickyCartBar
        productName={product.name}
        price={product.price}
        onAddToCart={handleAddToCart}
      />
    </>
  )
}
