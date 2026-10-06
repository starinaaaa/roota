"use server";
import { createServerClient } from "@/lib/supabase/server";
import { checkoutSchema, uuid } from "@/lib/validation";
import { cookies } from "next/headers";
import { sendOrderNotification } from "@/lib/notifications";
import { quoteDelivery } from "@/lib/delivery/service";
import type { CreateOrderResult } from "@/types";
const messages: Record<string, string> = {
  EMPTY_CART: "Корзина пуста",
  OUT_OF_STOCK:
    "Товар закончился или доступное количество изменилось. Проверьте корзину.",
  UNAVAILABLE: "Один из товаров больше недоступен.",
  PREORDER_DISABLED: "Предзаказ этого изделия недоступен.",
  PRICE_CHANGED:
    "Цена изменилась. Обновите страницу и подтвердите новую сумму.",
  KEY_REUSED: "Данные изменились после отправки. Обновите страницу.",
  DELIVERY_EXPIRED: "Расчёт доставки устарел. Рассчитайте доставку ещё раз.",
  PACKING_CHANGED: "Упаковка изменилась. Рассчитайте доставку ещё раз.",
  CART_CHANGED:
    "Корзина изменилась. Обновите страницу и пересчитайте доставку.",
  INVALID_INPUT: "Проверьте данные заказа.",
};
export async function createOrder(
  formData: unknown,
  requestKey: unknown,
  expectedTotal: unknown,
): Promise<CreateOrderResult> {
  const form = checkoutSchema.safeParse(formData),
    key = uuid.safeParse(requestKey);
  if (!form.success)
    return { success: false, error: form.error.issues[0].message };
  if (
    !key.success ||
    !(
      typeof expectedTotal === "number" &&
      Number.isFinite(expectedTotal) &&
      Math.abs(Math.round(expectedTotal * 100) - expectedTotal * 100) < 0.000001
    ) ||
    Number(expectedTotal) < 1
  )
    return { success: false, error: "Проверьте корзину и обновите страницу." };
  const store = await cookies(),
    session = store.get("cart_session")?.value;
  if (!uuid.safeParse(session).success)
    return {
      success: false,
      error: "Обновите страницу, чтобы восстановить корзину.",
    };
  try {
    const db = createServerClient();
    if (!form.data.deliveryQuoteId)
      return {
        success: false,
        error: "Выберите пункт и рассчитайте доставку.",
      };
    // Retrying a committed checkout must succeed even though its cart is now empty.
    const { data: previous, error: lookupError } = await db
      .from("orders")
      .select("id")
      .eq("cart_session", session)
      .eq("request_key", key.data)
      .maybeSingle();
    if (lookupError) throw new Error("Не удалось проверить заказ.");
    if (!previous) {
      const { data: stored, error: quoteError } = await db
        .from("delivery_quotes")
        .select("city,point,phone,expires_at")
        .eq("id", form.data.deliveryQuoteId)
        .eq("cart_session", session)
        .maybeSingle();
      if (
        quoteError ||
        !stored ||
        stored.phone !== form.data.phone ||
        Date.parse(stored.expires_at) < Date.now()
      )
        return {
          success: false,
          error: "Расчёт доставки устарел. Рассчитайте доставку ещё раз.",
        };
      const fresh = await quoteDelivery(
        form.data.phone,
        stored.city,
        stored.point.id,
        form.data.deliveryQuoteId,
      );
      // SQL verifies the current cart, packing rule, prices, and final total atomically.
      if (!Number.isFinite(fresh.totalCost))
        throw new Error("Не удалось проверить доставку.");
    }
    const { data, error } = await db.rpc("checkout_delivery_order", {
      p_session: session,
      p_key: key.data,
      p_form: form.data,
      p_expected_total: expectedTotal,
      p_quote: form.data.deliveryQuoteId,
    });
    if (error)
      return {
        success: false,
        error:
          messages[error.message] ??
          "Не удалось сохранить заказ. Попробуйте ещё раз.",
      };
    if (!data?.id || !data?.number)
      return {
        success: false,
        error: "Не удалось подтвердить сохранение заказа.",
      };
    try {
      await sendOrderNotification(data.id);
    } catch {
      /* The committed order is independent of notification delivery. */
    }
    return { success: true, orderId: data.id, orderNumber: data.number };
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error &&
        !/fetch|JSON|network|abort|timeout/i.test(e.message)
          ? e.message
          : "Не удалось связаться со студией. Попробуйте ещё раз.",
    };
  }
}
