import "server-only";
import { createServerClient } from "@/lib/db";
import type { PaymentRow } from "./model";

// Read the saved delivery choice; a zero shipping amount does not mean free delivery.
export async function paymentDeliveryIsSeparate(payment: PaymentRow) {
  const db = createServerClient();
  if (payment.order_id) {
    const { data, error } = await db
      .from("orders")
      .select("delivery_details")
      .eq("id", payment.order_id)
      .single();
    if (error || !data)
      throw new Error("Не удалось проверить условия доставки");
    return data.delivery_details?.provider === "yandex";
  }
  if (payment.test_order_id) {
    const { data, error } = await db
      .from("payment_test_orders")
      .select("delivery")
      .eq("id", payment.test_order_id)
      .single();
    if (error || !data)
      throw new Error("Не удалось проверить условия доставки");
    return data.delivery?.provider === "yandex";
  }
  throw new Error("Не удалось проверить условия доставки");
}
