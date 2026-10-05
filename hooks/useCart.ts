"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCartUI } from "@/contexts/CartUIContext";
import { addToCart, removeFromCart, updateCartItem } from "@/lib/actions/cart";
import type { Product } from "@/types";

// useCart reads from and writes to the shared CartUIContext so that all
// mounted instances (CartDrawer, ProductClientWrapper, CartPageContent, …)
// always see the same items.  Mutations are applied optimistically to the
// shared state and then confirmed / corrected by router.refresh().
export function useCart() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { isOpen, open, close, items, setItems, setError } = useCartUI();

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
    setError(null);
    // Optimistic: add / increment immediately so the drawer feels instant
    if (product) {
      setItems((prev) => {
        const existing = prev.find((i) => i.product_id === productId);
        if (existing) {
          return prev.map((i) =>
            i.product_id === productId
              ? { ...i, quantity: i.quantity + qty }
              : i,
          );
        }
        return [
          ...prev,
          {
            id: `optimistic-${productId}`,
            cart_id: "",
            product_id: productId,
            quantity: qty,
            product,
          },
        ];
      });
    }

    startTransition(async () => {
      let result;
      try {
        result = await addToCart(productId, qty);
      } catch {
        result = {
          error: "Нет соединения. Попробуйте добавить изделие ещё раз.",
        };
      }

      if (result.error) {
        // Revert the optimistic add
        if (product) {
          setItems((prev) =>
            prev
              .map((i) =>
                i.product_id === productId
                  ? { ...i, quantity: i.quantity - qty }
                  : i,
              )
              .filter((i) => i.quantity > 0),
          );
        }
        onError?.(result.error);
        setError(result.error);
        router.refresh();
        return;
      }

      // Refresh so layout re-fetches the cart and replaces the optimistic item
      // with the real DB row (correct id / cart_id).
      router.refresh();
      onSuccess?.();
    });
  }

  // ── removeItem ─────────────────────────────────────────────────────────────
  function removeItem(productId: string) {
    setError(null);
    const previous = items;
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
    startTransition(async () => {
      try {
        const result = await removeFromCart(productId);
        if (result.error) {
          setItems(previous);
          setError(result.error);
        }
      } catch {
        setItems(previous);
        setError("Нет соединения. Не удалось убрать изделие.");
      }
      router.refresh();
    });
  }

  // ── updateQuantity ─────────────────────────────────────────────────────────
  function updateQuantity(productId: string, qty: number) {
    setError(null);
    // Snapshot current state so we can revert if the server rejects the update
    const prevItems = items;

    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.product_id !== productId)
        : prev.map((i) =>
            i.product_id === productId ? { ...i, quantity: qty } : i,
          ),
    );

    startTransition(async () => {
      let result;
      try {
        result = await updateCartItem(productId, qty);
      } catch {
        result = { error: "Нет соединения. Не удалось изменить количество." };
      }
      if (result.error) {
        // Server rejected the quantity (stock exceeded) — revert optimistic update
        setItems(prevItems);
        setError(result.error);
        router.refresh();
        return;
      }
      router.refresh();
    });
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
  };
}
