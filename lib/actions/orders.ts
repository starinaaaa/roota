"use server";
import { checkoutIssue } from "@/lib/analytics/checkout-errors";
import { getPool } from "@/lib/db/pool";
import { recordFunnelEvent } from "@/lib/analytics/server";
import { revalidateTag } from "next/cache";
import { createServerClient } from "@/lib/db";
import { checkoutSchema, uuid } from "@/lib/validation";
import { after } from "next/server";
import { processEmailQueue } from "@/lib/email/queue";
import { cookies } from "next/headers";
import { sendOrderNotification } from "@/lib/notifications";
import { quoteDelivery } from "@/lib/delivery/service";
import type { CreateOrderResult } from "@/types";
import { buildReceipt } from "@/lib/payments/receipt";
import {
  paymentMode,
  receiptProfile,
  orderNumberForPayment,
} from "@/lib/payments/robokassa";
const messages: Record<string, string> = {
  PROMO_INVALID: "Промокод не найден или не подходит для указанного телефона.",
  PROMO_EXPIRED: "Срок действия промокода истёк или он был отменён.",
  PROMO_USED: "Этот промокод уже использован.",
  PROMO_RESERVED: "Промокод уже применён к неоплаченному заказу. Оплатите или отмените его перед новым оформлением.",
  ORDER_UNAVAILABLE:
    "Срок резерва истёк. Соберите заказ заново, чтобы проверить наличие.",
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
async function createOrderInternal(
  formData: unknown,
  requestKey: unknown,
  expectedTotal: unknown,
): Promise<CreateOrderResult> {
  const form = checkoutSchema.safeParse(formData),
    key = uuid.safeParse(requestKey);
  if (!form.success)
    return {
      success: false,
      error: form.error.issues[0].message,
      ...checkoutIssue(form.error.issues[0]),
    };
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
    const mode = paymentMode();
    const fiscal = mode ? receiptProfile(mode) : null;
    const db = createServerClient();
    const courier = form.data.deliveryMethod === "yandex_courier";
    if (!courier && !form.data.deliveryQuoteId)
      return {
        success: false,
        error: "Выберите пункт и рассчитайте доставку.",
      };
    // Retrying a committed checkout must succeed even though its cart is now empty.
    const { data: previous, error: lookupError } = await db
      .from(mode === "test" ? "payment_test_orders" : "orders")
      .select("id")
      .eq("cart_session", session)
      .eq("request_key", key.data)
      .maybeSingle();
    if (lookupError) throw new Error("Не удалось проверить заказ.");
    if (!previous) {
      const { error: cleanupError } = await db.rpc(
        "prune_unpublished_cart_items",
        {
          p_session: session,
        },
      );
      if (cleanupError)
        throw new Error("Не удалось проверить корзину. Повторите отправку.");
      if (!courier) {
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
            code: "DELIVERY_EXPIRED",
            field: "deliveryQuoteId",
            error: "Расчёт доставки устарел. Рассчитайте доставку ещё раз.",
          };
        const fresh = await quoteDelivery(
          form.data.phone,
          stored.city,
          stored.point.id,
          form.data.deliveryQuoteId,
          form.data.splitShipments ?? false,
        );
        // SQL verifies the current cart, packing rule, prices, and final total atomically.
        if (!Number.isFinite(fresh.totalCost))
          throw new Error("Не удалось проверить доставку.");
      }
    }
    // Preserve existing retry payloads for orders without a promotion.
    const { promoCode, ...ordinaryForm } = form.data;
    const { data, error } = await db.rpc(
      form.data.promoCode ? "checkout_reward_order" : mode ? "checkout_robokassa" : "checkout_delivery_order",
      {
        p_session: session,
        p_key: key.data,
        p_form: promoCode ? form.data : ordinaryForm,
        p_expected_total: expectedTotal,
        p_quote: courier ? null : form.data.deliveryQuoteId,
        ...(form.data.promoCode ? { p_mode: mode ?? "none" } : mode ? { p_mode: mode } : {}),
      },
    );
    if (error)
      return {
        success: false,
        code: /^[A-Z_]{1,80}$/.test(error.message)
          ? error.message
          : "SAVE_FAILED",
        field: /PROMO/.test(error.message) ? "promoCode" : /DELIVERY|PACKING/.test(error.message)
          ? "deliveryQuoteId"
          : /STOCK|CART|PRICE|UNAVAILABLE|PREORDER/.test(error.message)
            ? "cart"
            : "order",
        error:
          messages[error.message] ??
          "Не удалось сохранить заказ. Попробуйте ещё раз.",
      };
    revalidateTag("catalog", { expire: 0 });
    if (mode && data?.id) {
      if (fiscal && !data.receipt) {
        const receipt = buildReceipt(data, fiscal);
        const { error: receiptError } = await db
          .from("payments")
          .update({ receipt })
          .eq("id", data.id)
          .eq("status", "pending")
          .is("receipt", null);
        if (receiptError)
          throw new Error("Не удалось подготовить оплату. Повторите отправку.");
      }
      if (mode === "live")
        after(async () => {
          try {
            await sendOrderNotification(data.order_id);
          } catch {
            console.error("order_notification_failed");
          }
          try {
            await processEmailQueue();
          } catch {
            console.error("customer_email_queue_failed");
          }
        });
      return {
        success: true,
        orderId: data.order_id ?? data.test_order_id,
        orderNumber: await orderNumberForPayment({
          mode,
          order_id: data.order_id,
          inv_id: String(data.inv_id),
        }),
        paymentId: data.id,
      };
    }
    if (!data?.id || !data?.number)
      return {
        success: false,
        error: "Не удалось подтвердить сохранение заказа.",
      };
    after(async () => {
      try {
        await processEmailQueue();
      } catch {
        console.error("customer_email_queue_failed");
      }
    });
    try {
      await sendOrderNotification(data.id);
    } catch {
      /* The committed order is independent of notification delivery. */
    }
    return { success: true, orderId: data.id, orderNumber: data.number };
  } catch (e) {
    return {
      success: false,
      code: "SAVE_OR_PAYMENT_FAILED",
      field: "order",
      error:
        e instanceof Error &&
        !/PAYMENT_CONFIG|RECEIPT_|INVALID_AMOUNT|ZodError|Unexpected/i.test(
          e.message,
        ) &&
        !/fetch|JSON|network|abort|timeout/i.test(e.message)
          ? e.message
          : "Не удалось связаться со студией. Попробуйте ещё раз.",
    };
  }
}

export async function createOrder(
  formData: unknown,
  requestKey: unknown,
  expectedTotal: unknown,
): Promise<CreateOrderResult> {
  const result = await createOrderInternal(formData, requestKey, expectedTotal);
  if (!result.success) {
    await recordFunnelEvent("checkout_error", "order_submission");
    try {
      const session = (await cookies()).get("cart_session")?.value;
      if (session)
        await getPool().query(
          "select public.record_checkout_obstacle($1,'order_error',$2,$3)",
          [session, result.field ?? "order", result.code ?? "ORDER_FAILED"],
        );
    } catch {
      /* Diagnostics must never change the checkout result. */
    }
  }
  if (result.success) {
    try {
      const session = (await cookies()).get("cart_session")?.value;
      if (session)
        await getPool().query(
          `update public.checkout_obstacles e set corrected_at=coalesce(e.corrected_at,now()),order_id=o.id from public.orders o where o.id=$2 and o.cart_session=$1 and e.session_id=md5($1) and (e.order_id is null or e.order_id=o.id) and e.created_at>now()-interval '7 days'`,
          [session, result.orderId],
        );
    } catch {
      /* A diagnostics failure cannot change a committed checkout. */
    }
  }
  return result;
}
