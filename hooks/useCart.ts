'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useCartUI } from '@/contexts/CartUIContext'
import { addToCart, removeFromCart, updateCartItem } from '@/lib/actions/cart'
import type { CartItem, Product } from '@/types'

// useCart reads from and writes to the shared CartUIContext so that all
// mounted instances (CartDrawer, ProductClientWrapper, CartPageContent, …)
// always see the same items.  Mutations are applied optimistically to the
// shared state and then confirmed / corrected by router.refresh().
export function useCart() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { isOpen, open, close, items, setItems } = useCartUI()

  // ── addItem ────────────────────────────────────────────────────────────────
  // Pass `product` (5th arg) to get an instant optimistic update in the drawer.
  // Without it the item appears after router.refresh() completes (~0.5–1 s).
  function addItem(
    productId: string,
    qty = 1,
    onSuccess?: () => void,
    onError?: (msg: string) => void,
    product?: Product,
  ) {
    // Optimistic: add / increment immediately so the drawer feels instant
    if (product) {
      setItems(prev => {
        const existing = prev.find(i => i.product_id === productId)
        if (existing) {
          return prev.map(i =>
            i.product_id === productId ? { ...i, quantity: i.quantity + qty } : i
          )
        }
        return [...prev, {
          id:         `optimistic-${productId}`,
          cart_id:    '',
          product_id: productId,
          quantity:   qty,
          product,
        }]
      })
    }

    startTransition(async () => {
      const result = await addToCart(productId, qty)

      if (result.error) {
        // Revert the optimistic add
        if (product) {
          setItems(prev =>
            prev
              .map(i => i.product_id === productId ? { ...i, quantity: i.quantity - qty } : i)
              .filter(i => i.quantity > 0)
          )
        }
        onError?.(result.error)
        return
      }

      // Refresh so layout re-fetches the cart and replaces the optimistic item
      // with the real DB row (correct id / cart_id).
      router.refresh()
      onSuccess?.()
    })
  }

  // ── removeItem ─────────────────────────────────────────────────────────────
  function removeItem(productId: string) {
    setItems(prev => prev.filter(i => i.product_id !== productId))
    startTransition(async () => {
      await removeFromCart(productId)
      router.refresh()
    })
  }

  // ── updateQuantity ─────────────────────────────────────────────────────────
  function updateQuantity(productId: string, qty: number) {
    // Snapshot current state so we can revert if the server rejects the update
    const prevItems = items

    setItems(prev =>
      qty <= 0
        ? prev.filter(i => i.product_id !== productId)
        : prev.map(i => i.product_id === productId ? { ...i, quantity: qty } : i)
    )

    startTransition(async () => {
      const result = await updateCartItem(productId, qty)
      if (result.error) {
        // Server rejected the quantity (stock exceeded) — revert optimistic update
        setItems(prevItems)
        return
      }
      router.refresh()
    })
  }

  return {
    items,
    isPending,
    addItem,
    removeItem,
    updateQuantity,
    isDrawerOpen: isOpen,
    openDrawer:   open,
    closeDrawer:  close,
  }
}
