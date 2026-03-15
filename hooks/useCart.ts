'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useCartUI } from '@/contexts/CartUIContext'
import { addToCart, removeFromCart, updateCartItem } from '@/lib/actions/cart'
import type { CartItem } from '@/types'

// useCart accepts server-fetched items and manages them locally so mutations
// (quantity updates, removals) feel instant — the UI reflects changes before
// the server round-trip completes.  After router.refresh() finishes and the
// parent re-renders with fresh serverItems, useEffect syncs the local state.
export function useCart(serverItems: CartItem[] = []) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { isOpen, open, close } = useCartUI()

  // Local optimistic state — starts from server data, mutated instantly
  const [items, setItems] = useState<CartItem[]>(serverItems)

  // Sync whenever the parent re-renders with fresh server data
  // (triggered by router.refresh() completing after each mutation)
  useEffect(() => {
    setItems(serverItems)
  }, [serverItems])

  function addItem(productId: string, qty = 1, onSuccess?: () => void) {
    startTransition(async () => {
      await addToCart(productId, qty)
      router.refresh()
      onSuccess?.()
    })
  }

  function removeItem(productId: string) {
    // 1. Optimistic: remove instantly from local state
    setItems(prev => prev.filter(i => i.product_id !== productId))
    // 2. Fire server action in background; router.refresh() syncs final state
    startTransition(async () => {
      await removeFromCart(productId)
      router.refresh()
    })
  }

  function updateQuantity(productId: string, qty: number) {
    // 1. Optimistic: apply new quantity (or remove if qty drops to 0)
    if (qty <= 0) {
      setItems(prev => prev.filter(i => i.product_id !== productId))
    } else {
      setItems(prev =>
        prev.map(i => i.product_id === productId ? { ...i, quantity: qty } : i)
      )
    }
    // 2. Fire server action in background; router.refresh() syncs final state
    startTransition(async () => {
      await updateCartItem(productId, qty)
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
    openDrawer: open,
    closeDrawer: close,
  }
}
