"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { CartItem } from "@/types";

type CartContextType = {
  // Drawer open/close
  isOpen: boolean;
  open: () => void;
  close: () => void;
  // Shared cart items — single source of truth for all useCart() instances
  items: CartItem[];
  setItems: React.Dispatch<React.SetStateAction<CartItem[]>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

const CartContext = createContext<CartContextType | null>(null);

type ProviderProps = {
  children: React.ReactNode;
  initialItems?: CartItem[];
};

export function CartUIProvider({ children, initialItems = [] }: ProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<CartItem[]>(initialItems);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Re-sync whenever the server layout re-renders with fresh data
  // (triggered by router.refresh() after any cart mutation)
  useEffect(() => {
    const timer = setTimeout(() => setItems(initialItems), 0);
    return () => clearTimeout(timer);
  }, [initialItems]);

  return (
    <CartContext.Provider
      value={{ isOpen, open, close, items, setItems, error, setError }}
    >
      {children}
      {error && (
        <div
          role="alert"
          className="fixed bottom-5 left-5 right-5 z-[100] mx-auto max-w-lg bg-stone-900 text-stone-50 p-4 flex gap-4 items-center shadow-lg"
        >
          <p className="flex-1 text-sm">{error}</p>
          <button
            aria-label="Закрыть сообщение"
            className="p-2"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}
    </CartContext.Provider>
  );
}

export function useCartUI() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCartUI must be used inside CartUIProvider");
  return ctx;
}
