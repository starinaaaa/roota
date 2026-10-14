import "server-only";
import { createServerClient } from "./supabase/server";
import {
  orderNotificationText,
  sendTelegramMessage,
} from "./telegram-transport";
// Disabled by default. Only the studio's configured chat receives notifications.
export async function sendOrderNotification(
  orderId: string,
  event: "created" | "paid" = "created",
): Promise<"disabled" | "sent" | "failed" | "busy"> {
  if (
    process.env.NOTIFICATIONS_ENABLED !== "true" ||
    !process.env.TELEGRAM_BOT_TOKEN ||
    !process.env.TELEGRAM_CHAT_ID
  )
    return "disabled";
  const db = createServerClient();
  const { data: claim, error } = await db.rpc("claim_notification_event", {
    p_order: orderId,
    p_event: event,
  });
  if (error || !claim) return "busy";
  const { data: order } = await db
    .from("orders")
    .select("order_number,total_amount,status,payment_status")
    .eq("id", orderId)
    .single();
  let state: "sent" | "failed" = "failed";
  try {
    if (order) {
      const result = await sendTelegramMessage(
        process.env.TELEGRAM_BOT_TOKEN,
        process.env.TELEGRAM_CHAT_ID,
        orderNotificationText(order, event),
      );
      if (result.ok) state = "sent";
      else console.error("telegram_notification_failed", result.reason);
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
