'use client'

import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useCart } from '@/hooks/useCart'
import ProductInfo from './ProductInfo'
import StockLimitModal from './StockLimitModal'
import type { Product } from '@/types'

type Props = {
  product: Product
  inCart?: boolean // kept for server compat, actual qty comes from context
}

export default function ProductClientWrapper({ product }: Props) {
  const [stockModal, setStockModal] = useState<{ availableQty: number } | null>(null)
  const { addItem, items, updateQuantity, openDrawer } = useCart()

  // Derive cart state from the shared context (seeded by layout's getCart)
  const cartItem = items.find(i => i.product_id === product.id)
  const cartQty  = cartItem?.quantity ?? 0

  function handleIncrement() {
    if (cartQty === 0) {
      // First add — open drawer so the user sees the item appear
      addItem(
        product.id,
        1,
        () => openDrawer(),
        (msg) => {
          const match = msg.match(/(\d+)/)
          setStockModal({ availableQty: match ? parseInt(match[1], 10) : 0 })
        },
        product,
      )
    } else {
      // Already in cart — increment qty (server validates stock, reverts silently)
      updateQuantity(product.id, cartQty + 1)
    }
  }

  function handleDecrement() {
    // Goes to 0 → removeFromCart (handled inside updateQuantity)
    updateQuantity(product.id, cartQty - 1)
  }

  return (
    <>
      <ProductInfo
        product={product}
        cartQty={cartQty}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
      />

      {/* StockLimitModal: shown when addItem reports stock error */}
      <AnimatePresence>
        {stockModal && (
          <StockLimitModal
            productId={product.id}
            productName={product.name}
            availableQty={stockModal.availableQty}
            onClose={() => setStockModal(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
