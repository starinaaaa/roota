// Zustand cart store с persist в localStorage.
// isDrawerOpen НЕ сохраняется — drawer всегда закрыт при перезагрузке.
// items сохраняются под ключом 'glina-cart'.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from '@/types'

// ── Тип одного элемента корзины ──────────────────────────────────────────────

export type CartItem = {
  product: Pick<Product, 'id' | 'name' | 'slug' | 'price' | 'images' | 'in_stock'>
  quantity: number
}

// ── Тип store ────────────────────────────────────────────────────────────────

type CartStore = {
  // State
  items: CartItem[]
  isDrawerOpen: boolean

  // Cart mutations
  addItem: (product: CartItem['product'], qty?: number) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void

  // Drawer control
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void

  // Computed
  totalItems: () => number
  totalPrice: () => number
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isDrawerOpen: false,

      // ── addItem ─────────────────────────────────────────────────────────────
      addItem: (product, qty = 1) =>
        set(state => {
          const existing = state.items.find(i => i.product.id === product.id)
          if (existing) {
            return {
              items: state.items.map(i =>
                i.product.id === product.id
                  ? { ...i, quantity: i.quantity + qty }
                  : i
              ),
            }
          }
          return { items: [...state.items, { product, quantity: qty }] }
        }),

      // ── removeItem ──────────────────────────────────────────────────────────
      removeItem: (productId) =>
        set(state => ({
          items: state.items.filter(i => i.product.id !== productId),
        })),

      // ── updateQuantity ──────────────────────────────────────────────────────
      updateQuantity: (productId, quantity) =>
        set(state => {
          if (quantity <= 0) {
            return { items: state.items.filter(i => i.product.id !== productId) }
          }
          return {
            items: state.items.map(i =>
              i.product.id === productId ? { ...i, quantity } : i
            ),
          }
        }),

      // ── clearCart ───────────────────────────────────────────────────────────
      clearCart: () => set({ items: [] }),

      // ── Drawer ──────────────────────────────────────────────────────────────
      openDrawer:   () => set({ isDrawerOpen: true }),
      closeDrawer:  () => set({ isDrawerOpen: false }),
      toggleDrawer: () => set(s => ({ isDrawerOpen: !s.isDrawerOpen })),

      // ── Computed ────────────────────────────────────────────────────────────
      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
      totalPrice: () =>
        get().items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
    }),
    {
      name: 'glina-cart',
      // Сохранять только items, isDrawerOpen сбрасывается при перезагрузке
      partialize: (state) => ({ items: state.items }),
    }
  )
)
