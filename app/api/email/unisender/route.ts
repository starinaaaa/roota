import { emailWebhookKeys } from "@/lib/email/provider-config";
import { createServerClient } from "@/lib/db";
import { parseSignedEmailWebhook, deliveryState } from "@/lib/email/webhook";
import { getPool } from "@/lib/db/pool";
import { applyStudioDeliveryEvent } from "@/lib/email/studio-notifications";
export const runtime = "nodejs";
// Provider availability probe. GET never reads or changes customer data.
export async function GET() {
  return Response.json({ ok: true });
}
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 1024 * 1024)
    return new Response(null, { status: 413 });
  const raw = await request.text();
  const events = emailWebhookKeys(process.env)
    .map((key) => parseSignedEmailWebhook(raw, key))
    .find((events) => events !== null);
  if (!events) return new Response(null, { status: 401 });
  const db = createServerClient();
  for (const event of events) {
    const state = deliveryState(event.status ?? "");
    if (!state || !event.email) continue;
    const recipient = event.email.toLowerCase();
    try {
      if (await applyStudioDeliveryEvent(getPool(), event, state)) continue;
    } catch {
      return new Response(null, { status: 503 });
    }
    let lookup = db
      .from("email_messages")
      .select("id,kind,subscription_id")
      .eq("recipient", recipient);
    if (
      event.metadata?.message_id &&
      /^[a-f0-9-]{36}$/.test(event.metadata.message_id)
    )
      lookup = lookup.eq("id", event.metadata.message_id);
    else if (event.job_id) lookup = lookup.eq("provider_job_id", event.job_id);
    else continue;
    const { data: m, error } = await lookup.maybeSingle();
    if (error) return new Response(null, { status: 503 });
    if (!m) continue;
    const { error: save } = await db
      .from("email_messages")
      .update({
        state,
        provider_job_id: event.job_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", m.id)
      .in(
        "state",
        state === "delivered"
          ? ["sending", "accepted", "unknown"]
          : ["sending", "accepted", "unknown", "delivered", "failed"],
      );
    if (save) return new Response(null, { status: 503 });
    if (["bounced", "complained", "unsubscribed"].includes(state)) {
      const { error: block } = await db.rpc("block_email_recipient", {
        p_email: recipient,
        p_reason: state === "unsubscribed" ? "marketing_unsubscribed" : state,
      });
      if (block) return new Response(null, { status: 503 });
      let cancellation = db
        .from("email_messages")
        .update({
          state: "cancelled",
          last_error: "Адрес заблокирован провайдером",
        })
        .eq("recipient", recipient)
        .eq("state", "pending");
      if (state === "unsubscribed")
        cancellation = cancellation.in("kind", [
          "restock",
          "cart_reminder",
          "cart_link",
          "review_invite",
          "confirm",
        ]);
      const { error: cancel } = await cancellation;
      if (cancel) return new Response(null, { status: 503 });
    }
  }
  return Response.json({ ok: true });
}
