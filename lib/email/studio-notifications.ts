import type { Pool } from "pg";
import { emailProviderKey } from "./provider-config";
import { sendUnisenderEmail, type EmailMessage } from "./unisender-transport";
import { orderNotificationText } from "../telegram-transport";

type Event = "created" | "paid";
export type StudioNotificationState =
  "disabled" | "busy" | "sent" | "failed" | "unknown";
type StudioOrder = {
  order_number: string;
  total_amount: number;
  status: string;
  payment_status: string;
};
// Called only after the shared UniSender webhook signature has been verified.
export async function applyStudioDeliveryEvent(
  db: Pool,
  event: { email?: string; job_id?: string; metadata?: Record<string, string> },
  state: string,
) {
  const id = event.metadata?.studio_notification_id;
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) return false;
  if (event.email?.toLowerCase() !== "hello@roota.moscow") return true;
  if (state === "delivered")
    await db.query(
      "update notification_outbox set state='sent',delivered_at=coalesce(delivered_at,now()),provider_job_id=coalesce($2,provider_job_id),updated_at=now() where id=$1 and state in ('sending','sent','unknown')",
      [id, event.job_id ?? null],
    );
  else if (["bounced", "complained", "unsubscribed", "failed"].includes(state))
    await db.query(
      "update notification_outbox set state='unknown',updated_at=now() where id=$1 and state in ('sending','sent','unknown')",
      [id],
    );
  return true;
}
export function studioEmailMessage(
  order: StudioOrder,
  event: Event,
  id: string,
  env: Record<string, string | undefined>,
): EmailMessage {
  const testing = env.APP_ENV !== "production";
  const prefix = testing ? "[ПРОВЕРКА ПЕРЕНОСА] " : "[ROOTA] ";
  const adminUrl = new URL(
    "/admin",
    env.NEXT_PUBLIC_SITE_URL || "https://roota.moscow",
  ).href;
  const plaintext =
    prefix +
    orderNotificationText(order, event).replace(
      "https://roota.moscow/admin",
      adminUrl,
    );
  const html =
    "<p>" +
    plaintext
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\n", "<br>") +
    "</p>";
  return {
    to: "hello@roota.moscow",
    subject:
      prefix +
      (event === "paid" ? "Заказ оплачен " : "Новый заказ ") +
      order.order_number,
    plaintext,
    html,
    idempotenceKey: id,
    metadata: { studio_notification_id: id },
  };
}

export async function sendStudioNotification(
  db: Pool,
  orderId: string,
  event: Event,
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
): Promise<StudioNotificationState> {
  const key = emailProviderKey("order_" + event, env);
  if (
    env.NOTIFICATIONS_ENABLED !== "true" ||
    env.STUDIO_NOTIFICATION_CHANNEL !== "email" ||
    !key
  )
    return "disabled";
  const client = await db.connect();
  let order: (StudioOrder & { id: string }) | undefined;
  try {
    await client.query("BEGIN");
    // A lost acknowledgement can mean the provider accepted the message. Never
    // blindly reclaim it after the provider's short deduplication window.
    await client.query(
      "update notification_outbox set state='unknown',updated_at=now() where order_id=$1 and event=$2 and state='sending' and updated_at<now()-interval '5 minutes'",
      [orderId, event],
    );
    await client.query(
      "insert into notification_outbox(order_id,event) select id,$2 from orders where id=$1 and ($2='created' or payment_status='paid') on conflict(order_id,event) do nothing",
      [orderId, event],
    );
    order = (
      await client.query(
        "update notification_outbox n set state='sending',attempts=n.attempts+1,updated_at=now() from orders o where n.order_id=o.id and o.id=$1 and n.event=$2 and ($2='created' or o.payment_status='paid') and n.attempts<5 and (n.state='pending' or (n.state='failed' and n.updated_at<now()-interval '5 minutes')) returning n.id,o.order_number,o.total_amount,o.status,o.payment_status",
        [orderId, event],
      )
    ).rows[0];
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    throw Error("STUDIO_NOTIFICATION_CLAIM_FAILED");
  } finally {
    client.release();
  }
  if (!order) {
    const row = (
      await db.query(
        "select state from notification_outbox where order_id=$1 and event=$2",
        [orderId, event],
      )
    ).rows[0];
    return row?.state === "unknown" ? "unknown" : "busy";
  }
  const result = await sendUnisenderEmail(
    key,
    studioEmailMessage(order, event, order.id, env),
    request,
  );
  const state =
    result.state === "accepted"
      ? "sent"
      : result.state === "unknown"
        ? "unknown"
        : "failed";
  // A DB failure here leaves sending -> unknown, not an automatic duplicate.
  await db.query(
    "update notification_outbox set state=$2,provider_job_id=$3,updated_at=now() where id=$1 and state='sending'",
    [order.id, state, result.state === "accepted" ? result.jobId : null],
  );
  return state;
}

export async function processStudioNotifications(
  db: Pool,
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
) {
  if (
    env.NOTIFICATIONS_ENABLED !== "true" ||
    env.STUDIO_NOTIFICATION_CHANNEL !== "email"
  )
    return { disabled: true, processed: 0 };
  const rows = (
    await db.query(
      "select order_id,event from notification_outbox where (state='sending' and updated_at<now()-interval '5 minutes') or (attempts<5 and (state='pending' or (state='failed' and updated_at<now()-interval '5 minutes'))) order by updated_at,id limit 20",
    )
  ).rows;
  let processed = 0;
  for (const row of rows) {
    await sendStudioNotification(db, row.order_id, row.event, env, request);
    processed++;
  }
  return { disabled: false, processed };
}
