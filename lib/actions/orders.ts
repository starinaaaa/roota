"use server";
import { createServerClient } from "@/lib/supabase/server";
import { checkoutSchema, uuid } from "@/lib/validation";
import { cookies } from "next/headers";
import { sendOrderNotification } from "@/lib/notifications";
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
    !Number.isSafeInteger(expectedTotal) ||
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
    const { data, error } = await createServerClient().rpc("checkout_order", {
      p_session: session,
      p_key: key.data,
      p_form: form.data,
      p_expected_total: expectedTotal,
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
  } catch {
    return {
      success: false,
      error: "Не удалось связаться со студией. Попробуйте ещё раз.",
    };
  }
}
