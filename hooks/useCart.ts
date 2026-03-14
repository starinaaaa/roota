'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useCartUI } from '@/contexts/CartUIContext'
import { addToCart, removeFromCart, updateCartItem } from '@/lib/actions/cart'

export function useCart() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { isOpen, open, close } = useCartUI()

  function addItem(productId: string, qty = 1, onSuccess?: () => void) {
    startTransition(async () => {
      await addToCart(productId, qty)
      router.refresh()
      onSuccess?.()
    })
  }

  function removeItem(productId: string) {
    startTransition(async () => {
      await removeFromCart(productId)
      router.refresh()
    })
  }

  function updateQuantity(productId: string, qty: number) {
    startTransition(async () => {
      await updateCartItem(productId, qty)
      router.refresh()
    })
  }

  return {
    isPending,
    addItem,
    removeItem,
    updateQuantity,
    isDrawerOpen: isOpen,
    openDrawer: open,
    closeDrawer: close,
  }
}
