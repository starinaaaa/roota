import "server-only";
import { getPool } from "./db/pool";
import {
  sendStudioNotification,
  type StudioNotificationState,
} from "./email/studio-notifications";
// Both studio transports use the same persistent, atomically claimed outbox.
export async function sendOrderNotification(
  orderId: string,
  event: "created" | "paid" = "created",
): Promise<StudioNotificationState> {
  try {
    if (process.env.NOTIFICATIONS_ENABLED !== "true") return "disabled";
    return await sendStudioNotification(getPool(), orderId, event);
  } catch {
    console.error("studio_notification_unavailable");
    return "failed";
  }
}
