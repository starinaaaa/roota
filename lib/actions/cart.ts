"use server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { getProductsByIds } from "@/lib/products";
import { uuid } from "@/lib/validation";
import type { CartItem } from "@/types";
async function sessionId() {
  return (await cookies()).get("cart_session")?.value;
}
export async function getCart(): Promise<{ items: CartItem[] }> {
  const session = await sessionId();
  if (
    !uuid.safeParse(session).success ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    return { items: [] };
  try {
    const { data, error } = await createServerClient()
      .from("carts")
      .select("id,cart_items(id,cart_id,product_id,quantity,purchase_mode)")
      .eq("session_id", session)
      .maybeSingle();
    if (error || !data) return { items: [] };
    const products = await getProductsByIds(
      data.cart_items.map((r) => r.product_id),
    );
    const items = data.cart_items.flatMap((r) => {
      const product = products.find((p) => p.id === r.product_id);
      return product ? [{ ...r, product } as CartItem] : [];
    });
    return { items };
  } catch {
    return { items: [] };
  }
}
async function mutate(
  productId: string,
  qty: number,
  operation: "add" | "set",
  mode: "stock" | "preorder" = "stock",
): Promise<{ error?: string }> {
  const session = await sessionId();
  if (
    !uuid.safeParse(session).success ||
    !uuid.safeParse(productId).success ||
    !Number.isInteger(qty) ||
    qty < 0 ||
    qty > 100
  )
    return { error: "Обновите страницу и проверьте количество." };
  try {
    const { error } = await createServerClient().rpc("mutate_cart", {
      p_session: session,
      p_product: productId,
      p_qty: qty,
      p_operation: operation,
      p_mode: mode,
    });
    if (error) {
      const messages: Record<string, string> = {
        OUT_OF_STOCK: "Доступного количества недостаточно.",
        PREORDER_DISABLED: "Предзаказ недоступен.",
        UNAVAILABLE: "Товар недоступен.",
        MODE_CONFLICT: "Удалите товар из корзины перед сменой типа покупки.",
      };
      return {
        error: messages[error.message] ?? "Не удалось изменить корзину.",
      };
    }
    return {};
  } catch {
    return { error: "Нет соединения. Попробуйте ещё раз." };
  }
}
export async function addToCart(
  productId: string,
  qty = 1,
  mode: "stock" | "preorder" = "stock",
) {
  return mutate(productId, qty, "add", mode);
}
export async function updateCartItem(productId: string, qty: number) {
  return mutate(productId, Math.max(0, qty), "set");
}
export async function removeFromCart(productId: string) {
  return mutate(productId, 0, "set");
}
