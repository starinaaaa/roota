import "server-only";
import { randomBytes } from "node:crypto";
import { createServerClient } from "./supabase/server";
import { siteUrl } from "./seo";
import { uuid } from "./validation";
import type { PaymentRow } from "./payments/model";

export const validOrderToken = (token: string) => /^[a-f0-9]{64}$/.test(token);

export async function ensureOrderLink(orderId: string, rotate = false) {
  if (!uuid.safeParse(orderId).success) throw new Error("Неверный заказ");
  const { data, error } = await createServerClient().rpc(
    "ensure_order_access",
    {
      p_order: orderId,
      p_token: randomBytes(32).toString("hex"),
      p_rotate: rotate,
    },
  );
  if (error || typeof data !== "string" || !validOrderToken(data))
    throw new Error("Не удалось подготовить ссылку на заказ");
  return siteUrl(`/order/${data}`);
}

export async function orderIdForToken(token: string) {
  if (!validOrderToken(token)) return null;
  const { data, error } = await createServerClient()
    .from("order_access")
    .select("order_id")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error("Не удалось загрузить заказ");
  return data?.order_id ?? null;
}

export async function paymentForOrderToken(
  token: string,
): Promise<PaymentRow | null> {
  const orderId = await orderIdForToken(token);
  if (!orderId) return null;
  const db = createServerClient();
  const { error: expiryError } = await db.rpc("release_expired_reservations");
  if (expiryError) throw new Error("Не удалось обновить резерв");
  const { data, error } = await db
    .from("payments")
    .select("*")
    .eq("order_id", orderId)
    .eq("mode", "live")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Не удалось загрузить оплату");
  if (data) {
    const { data: order, error: orderError } = await db
      .from("orders")
      .select("status,payment_status")
      .eq("id", orderId)
      .single();
    if (orderError) throw new Error("Не удалось загрузить заказ");
    data.requires_review =
      order.status === "cancelled" && data.status === "paid";
    // A manually cancelled or refunded order must never offer an old pending payment form.
    if (
      (order.status === "cancelled" || order.payment_status !== "pending") &&
      data.status === "pending"
    )
      data.expires_at = new Date(0).toISOString();
  }
  return data as PaymentRow | null;
}
