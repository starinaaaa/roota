import "server-only";
import { randomBytes } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";
import { ensureOrderLink } from "@/lib/order-access";
import { siteUrl } from "@/lib/seo";
import { sendEmail } from "./server";
import { renderEmail, marketingKinds } from "./templates";
export async function processEmailQueue() {
  if (
    process.env.CUSTOMER_EMAILS_ENABLED !== "true" ||
    !process.env.UNISENDER_GO_API_KEY
  )
    return { disabled: true };
  const db = createServerClient();
  const prepared = await db.rpc("prepare_email_queue");
  if (prepared.error) throw new Error("Не удалось подготовить очередь");
  let accepted = 0,
    failed = 0,
    unknown = 0;
  for (let i = 0; i < 10; i++) {
    // Claim immediately before each send, so intervening opt-outs and pauses apply.
    const claimed = await db.rpc("claim_email_messages", { p_limit: 1 });
    if (claimed.error) throw new Error("Не удалось получить очередь");
    const m = claimed.data?.[0];
    if (!m) break;
    try {
      const { data: template, error } = await db
        .from("email_templates")
        .select("subject,body")
        .eq("kind", m.kind)
        .single();
      if (error || !template) throw new Error("TEMPLATE");
      let url = siteUrl("/"),
        label = "Открыть Roota",
        unsubscribe: string | undefined;
      const values: Record<string, string> = {
        product: m.payload.product ?? "",
      };
      let subscription = m.subscription_id
        ? (
            await db
              .from("email_subscriptions")
              .select("*")
              .eq("id", m.subscription_id)
              .single()
          ).data
        : null;
      if (m.order_id) {
        const { data: o, error: oe } = await db
          .from("orders")
          .select(
            "order_number,total_amount,order_items(product_name,quantity,price),payments(expires_at,status)",
          )
          .eq("id", m.order_id)
          .single();
        if (oe || !o) throw new Error("ORDER");
        values.number = o.order_number;
        values.total = String(o.total_amount);
        values.items = (o.order_items ?? [])
          .map(
            (i: { product_name: string; quantity: number; price: number }) =>
              `${i.product_name} × ${i.quantity} — ${i.price * i.quantity} ₽`,
          )
          .join("\n");
        const deadline = (o.payments ?? []).find(
          (p: { status: string }) => p.status === "pending",
        )?.expires_at;
        values.reservation = deadline
          ? `Резерв до ${new Date(deadline).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК. Актуальная оплата — на странице заказа.`
          : "Подробности и актуальный статус — на странице заказа.";
        url = await ensureOrderLink(m.order_id);
        label = "Открыть заказ";
        if (m.kind === "review_invite") {
          if (!subscription) {
            const { data: c, error: ce } = await db
              .from("email_subscriptions")
              .upsert(
                {
                  email: m.recipient,
                  purpose: "review",
                  resource: m.order_id,
                  token: randomBytes(32).toString("hex"),
                  confirmed_at: new Date().toISOString(),
                  consent_version: "order-review-2026-10-14",
                },
                {
                  onConflict: "email,purpose,resource",
                  ignoreDuplicates: true,
                },
              )
              .select("*")
              .maybeSingle();
            if (ce) throw new Error("CONSENT");
            subscription =
              c ??
              (
                await db
                  .from("email_subscriptions")
                  .select("*")
                  .eq("email", m.recipient)
                  .eq("purpose", "review")
                  .eq("resource", m.order_id)
                  .single()
              ).data;
            if (!subscription || subscription.revoked_at)
              throw new Error("CONSENT");
            await db
              .from("email_messages")
              .update({ subscription_id: subscription.id })
              .eq("id", m.id)
              .eq("claim", m.claim);
          }
          url = url.replace("/order/", "/review/");
          label = "Оставить отзыв";
        }
      }
      if (m.kind === "restock") {
        url = siteUrl(`/product/${m.payload.slug}`);
        label = "Посмотреть изделие";
      }
      if (subscription) {
        unsubscribe = siteUrl(`/email/${subscription.token}`);
        if (m.kind === "confirm") {
          url = unsubscribe;
          label = "Подтвердить email";
          values.purpose =
            {
              restock: "уведомление о поступлении изделия",
              cart: "ссылка на корзину и одно напоминание",
              news: "новости студии",
              review: "приглашение оставить отзыв",
            }[subscription.purpose as string] ?? "";
        }
        if (m.kind === "cart_reminder" || m.kind === "cart_link") {
          url = siteUrl(`/cart/restore/${subscription.token}`);
          label = "Вернуться к корзине";
        }
      }
      if (marketingKinds.has(m.kind) && !unsubscribe)
        throw new Error("CONSENT");
      const result = await sendEmail({
        to: m.recipient,
        transactional: m.kind.startsWith("order_"),
        idempotenceKey: m.id,
        ...renderEmail(template, values, url, label, unsubscribe),
        unsubscribeUrl: marketingKinds.has(m.kind) ? unsubscribe : undefined,
        metadata: { message_id: m.id },
      });
      if (result.state === "disabled" || result.state === "unconfigured")
        throw new Error("DISABLED");
      const state = result.state === "rejected" ? "failed" : result.state;
      const saved = await db
        .from("email_messages")
        .update({
          state,
          provider_job_id: result.state === "accepted" ? result.jobId : null,
          last_error:
            result.state === "rejected"
              ? `Провайдер отклонил письмо (${result.code ?? result.httpStatus ?? "проверьте настройки"})`
              : result.state === "unknown"
                ? "Проверьте доставку перед повтором"
                : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", m.id)
        .eq("claim", m.claim)
        .eq("state", "sending");
      if (saved.error) {
        unknown++;
        continue;
      }
      if (state === "accepted") {
        accepted++;
        if (m.kind === "restock")
          await db
            .from("waitlist")
            .update({ notified_at: new Date().toISOString() })
            .eq("product_id", m.payload.product_id)
            .eq("contact", m.recipient)
            .is("notified_at", null);
      } else if (state === "unknown") unknown++;
      else failed++;
    } catch {
      // Never retry automatically: the process may have failed after provider acceptance.
      unknown++;
      await db
        .from("email_messages")
        .update({
          state: "unknown",
          last_error: "Проверьте настройки и доставку перед повтором",
          updated_at: new Date().toISOString(),
        })
        .eq("id", m.id)
        .eq("claim", m.claim)
        .eq("state", "sending");
    }
  }
  return { accepted, failed, unknown };
}
