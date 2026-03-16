'use client'

import { createContext, useCallback, useContext, useState } from 'react'

type CartUIContextType = {
  isOpen: boolean
  open: () => void
  close: () => void
}

const CartUIContext = createContext<CartUIContextType | null>(null)

export function CartUIProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open  = useCallback(() => setIsOpen(true),  [])
  const close = useCallback(() => setIsOpen(false), [])
  return (
    <CartUIContext.Provider value={{ isOpen, open, close }}>
      {children}
    </CartUIContext.Provider>
  )
}

export function useCartUI() {
  const ctx = useContext(CartUIContext)
  if (!ctx) throw new Error('useCartUI must be used inside CartUIProvider')
  return ctx
}
