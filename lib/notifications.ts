import "server-only";
import { createServerClient } from "./supabase/server";
// Disabled by default. Only the studio's configured chat receives notifications.
export async function sendOrderNotification(
  orderId: string,
): Promise<"disabled" | "sent" | "failed" | "busy"> {
  if (
    process.env.NOTIFICATIONS_ENABLED !== "true" ||
    !process.env.TELEGRAM_BOT_TOKEN ||
    !process.env.TELEGRAM_CHAT_ID
  )
    return "disabled";
  const db = createServerClient();
  const { data: claim, error } = await db.rpc("claim_notification", {
    p_order: orderId,
  });
  if (error || !claim) return "busy";
  const { data: order } = await db
    .from("orders")
    .select("order_number,total_amount")
    .eq("id", orderId)
    .single();
  let state: "sent" | "failed" = "failed";
  try {
    if (order) {
      const response = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: `Новый заказ ${order.order_number}\nСумма изделий: ${order.total_amount} ₽\nОткройте админку студии для деталей.`,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      const result = await response.json();
      if (response.ok && result.ok) state = "sent";
    }
  } catch {
    /* Never log provider URLs, keys or buyer information. */
  }
  await db
    .from("notification_outbox")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", claim);
  return state;
}
