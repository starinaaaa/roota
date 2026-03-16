'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { CartItem } from '@/types'

type CartContextType = {
  // Drawer open/close
  isOpen: boolean
  open:   () => void
  close:  () => void
  // Shared cart items — single source of truth for all useCart() instances
  items:    CartItem[]
  setItems: React.Dispatch<React.SetStateAction<CartItem[]>>
}

const CartContext = createContext<CartContextType | null>(null)

type ProviderProps = {
  children:      React.ReactNode
  initialItems?: CartItem[]
}

export function CartUIProvider({ children, initialItems = [] }: ProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [items,  setItems]  = useState<CartItem[]>(initialItems)

  const open  = useCallback(() => setIsOpen(true),  [])
  const close = useCallback(() => setIsOpen(false), [])

  // Re-sync whenever the server layout re-renders with fresh data
  // (triggered by router.refresh() after any cart mutation)
  useEffect(() => { setItems(initialItems) }, [initialItems])

  return (
    <CartContext.Provider value={{ isOpen, open, close, items, setItems }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCartUI() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCartUI must be used inside CartUIProvider')
  return ctx
}
