import {
  orderNotificationText,
  sendTelegramMessage,
} from "./telegram-transport";

// Temporary existing relay, explicitly approved by the owner on 16 October 2026.
// It never reads the new database; only operational order fields are sent.
export const studioTelegramRelayUrl =
  "https://tntzcgdakwmzmoygmlur.supabase.co/functions/v1/telegram-order-notification";

export function studioTelegramConfigured(
  env: Record<string, string | undefined>,
) {
  return Boolean(
    env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID && env.TELEGRAM_RELAY_KEY,
  );
}

export async function sendStudioTelegram(
  order: Parameters<typeof orderNotificationText>[0],
  event: "created" | "paid",
  env: Record<string, string | undefined>,
  request: typeof fetch = fetch,
): Promise<{ state: "accepted"; jobId: string } | { state: "unknown" }> {
  // Explicitly construct the payload so customer contact fields cannot leak.
  const text = orderNotificationText(
    {
      order_number: order.order_number,
      total_amount: order.total_amount,
      status: order.status,
      payment_status: order.payment_status,
    },
    event,
  );
  const result = await sendTelegramMessage(
    env.TELEGRAM_BOT_TOKEN!,
    env.TELEGRAM_CHAT_ID!,
    text,
    request,
    { url: studioTelegramRelayUrl, serviceKey: env.TELEGRAM_RELAY_KEY! },
  );
  // The existing relay can deliver to several established studio recipients.
  // Any failure may be partial delivery: never automatically resend duplicates.
  return result.ok
    ? { state: "accepted", jobId: "telegram" }
    : { state: "unknown" };
}
