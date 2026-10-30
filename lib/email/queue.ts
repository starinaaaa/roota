import { estimatedReadyLabel, productionEstimate } from "@/lib/preorder-copy";
import { courierContactLabel } from "@/lib/courier-contact";
import { orderProduction } from "@/lib/shop-operations";
import { plannedReadyDate } from "@/lib/production";
import { getPool } from "@/lib/db/pool";
import { cdnImageUrl } from "@/lib/image-cdn";
import { orderProductDetails } from "@/lib/order-product-details";
import {
  customerParcels,
  deliveryEmailUpdate,
  type CustomerParcel,
} from "@/lib/delivery/customer-parcels";
import "server-only";
import { relationList } from "@/lib/relation-list";
import { randomBytes } from "node:crypto";
import { createServerClient } from "@/lib/db";
import { ensureOrderLink } from "@/lib/order-access";
import { siteUrl } from "@/lib/seo";
import { sendEmail } from "./server";
import { renderEmail, marketingKinds, type EmailOrderItem } from "./templates";
import { ozonTrackingHint } from "@/lib/delivery/tracking";
import { reviewInvitation, rewardExpiry } from "@/lib/review-copy";
export async function processEmailQueue() {
  if (
    process.env.CUSTOMER_EMAILS_ENABLED !== "true" ||
    !(
      process.env.UNISENDER_GO_API_KEY ||
      process.env.UNISENDER_GO_SERVICE_API_KEY ||
      process.env.UNISENDER_GO_MARKETING_API_KEY
    )
  )
    return { disabled: true };
  const db = createServerClient();
  await getPool().query("select public.prepare_collection_campaigns()");
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
    let providerAttempted = false;
    try {
      const { data: template, error } = await db
        .from("email_templates")
        .select("subject,body")
        .eq("kind", m.kind)
        .single();
      if (error || !template) throw new Error("TEMPLATE");
      if (m.kind === "collection") {
        template.subject = m.payload.subject;
        template.body = `${m.payload.body}\n\n${(m.payload.products ?? []).map((p: { name: string; slug: string; price: number }) => `${p.name} — ${money(Number(p.price))}\n${siteUrl(`/product/${p.slug}`)}`).join("\n\n")}`;
      }
      let url = siteUrl("/"),
        label = "Открыть Roota",
        unsubscribe: string | undefined;
      const values: Record<string, string> = {
        product: m.payload?.product ?? "",
      };
      let orderItems: EmailOrderItem[] | undefined;
      let parcels: CustomerParcel[] | undefined;
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
            "order_number,created_at,customer_name,total_amount,discount_amount,delivery_amount,insurance_amount,delivery_type,delivery_address,delivery_details,tracking_number,request_payload,order_items(product_id,product_name,quantity,price,purchase_mode,lead_time_days,configuration),payments(expires_at,status,paid_at),order_shipments(state,posting_number,carrier_status,status_history,request_payload)",
          )
          .eq("id", m.order_id)
          .single();
        if (oe || !o) throw new Error("ORDER");
        values.number = o.order_number;
        values.discount = Number(o.discount_amount)>0 ? `Скидка на изделия: −${money(Number(o.discount_amount))}` : "";
        values.legal_version = o.request_payload?.form?.legalVersion ?? "";
        values.total = new Intl.NumberFormat("ru-RU", {
          maximumFractionDigits: 2,
        }).format(Number(o.total_amount));
        values.date =
          new Date(o.created_at).toLocaleString("ru-RU", {
            timeZone: "Europe/Moscow",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          }) + " МСК";
        values.recipient = o.customer_name ?? "";
        const courier = o.delivery_details?.provider === "yandex";
        values.delivery = courier
          ? "Курьер Яндекс Доставки"
          : o.delivery_details?.point?.name ||
            (o.delivery_type === "pickup" ? "Самовывоз" : "Доставка");
        values.address =
          o.delivery_details?.point?.address ||
          o.delivery_address ||
          "Адрес уточняется";
        values.shipping = courier
          ? `Оплачивается покупателем отдельно в приложении после согласования через ${courierContactLabel(o.delivery_details)}`
          : money(
              Number(o.delivery_amount ?? 0) + Number(o.insurance_amount ?? 0),
            );
        const shipment = relationList(o.order_shipments)[0];
        values.tracking_hint =
          o.delivery_details?.provider === "ozon"
            ? ozonTrackingHint(
                shipment?.state === "created" && !!shipment.posting_number,
              )
            : "";
        parcels =
          o.delivery_details?.provider === "ozon"
            ? customerParcels(
                o.delivery_details.packing,
                o.order_items,
                shipment,
              )
            : undefined;
        values.tracking =
          parcels
            ?.map((p) => p.number)
            .filter(Boolean)
            .join(", ") ||
          o.tracking_number ||
          (courier
            ? `Время и стоимость доставки согласуем: ${courierContactLabel(o.delivery_details)}`
            : "Появится после оформления отправления");
        if (
          m.payload?.posting_number &&
          !parcels?.some(
            (p) =>
              p.number === m.payload.posting_number &&
              (m.kind === "order_pickup"
                ? p.status === "in_delivery_point"
                : ["on_way", "in_courier_service"].includes(p.status ?? "")),
          )
        ) {
          await db
            .from("email_messages")
            .update({
              state: "cancelled",
              last_error: "Посылка заменена или её статус уже изменился",
            })
            .eq("id", m.id)
            .eq("claim", m.claim);
          continue;
        }
        const deliveryUpdate = deliveryEmailUpdate(
          m.kind,
          o.order_number,
          parcels ?? [],
          m.payload?.posting_number,
        );
        values.delivery_subject = deliveryUpdate.subject;
        values.delivery_update = deliveryUpdate.message;
        const details = await orderProductDetails(
          o.order_items.map((item) => item.product_id),
        );
        orderItems = o.order_items.map((i) => {
          const detail = details.get(i.product_id ?? "");
          return {
            name: detail?.title(i.product_name) ?? i.product_name,
            quantity: i.quantity,
            price: Number(i.price),
            imageUrl: detail?.image
              ? (cdnImageUrl(detail.image, 160) ?? siteUrl(detail.image))
              : undefined,
          };
        });
        const leadDays = Math.max(
          0,
          ...o.order_items.map((i) => i.lead_time_days ?? 0),
        );
        values.fulfillment = o.order_items.some(
          (i) => i.purchase_mode === "preorder",
        )
          ? `В заказе есть изделие на заказ.${leadDays ? ` Изготовление — ${productionEstimate(leadDays)} после оплаты.` : " Срок изготовления согласуем с вами."} О передаче в доставку сообщим отдельным письмом.`
          : courier
            ? `Доставка до двери по Москве и Подмосковью. Напишем в течение суток: ${courierContactLabel(o.delivery_details)}, согласуем время и стоимость, затем передадим заказ курьеру.`
            : "Готовые изделия передаём в доставку в течение 1–3 рабочих дней после оплаты. О передаче в доставку сообщим отдельным письмом.";
        const paidAt = relationList(o.payments).find(
          (p: { status: string }) => p.status === "paid",
        )?.paid_at;
        if (o.order_items.some((i) => i.purchase_mode === "preorder")) {
          const production = await orderProduction(m.order_id);
          const ready = production?.task_count
            ? production.ready_on
            : plannedReadyDate(paidAt, leadDays);
          if (ready)
            values.fulfillment = o.delivery_details?.packing?.split_dispatch ? `Предзаказ будет готов ${estimatedReadyLabel(ready)}. Готовые изделия отправим отдельной посылкой раньше. Срок доставки каждой посылки добавляется отдельно.` : `Готовность всего заказа — ${estimatedReadyLabel(ready)}. Отправим весь заказ после готовности всех изделий. Срок доставки добавляется отдельно.`;
        }
        values.payment = paidAt
          ? `Оплачено ${new Date(paidAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК`
          : "Актуальный статус оплаты — на странице заказа";
        values.items = orderItems
          .map(
            (i) => `${i.name} × ${i.quantity} — ${money(i.price * i.quantity)}`,
          )
          .join("\n");
        const deadline = relationList(o.payments).find(
          (p: { status: string }) => p.status === "pending",
        )?.expires_at;
        values.reservation = deadline
          ? `Резерв до ${new Date(deadline).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК. Актуальная оплата — на странице заказа.`
          : "Подробности и актуальный статус — на странице заказа.";
        url = await ensureOrderLink(m.order_id);
        values.document_url = `${url}/confirmation`;
        if (m.kind !== "order_created" && m.kind !== "order_paid")
          values.fulfillment = "";
        label = "Открыть заказ";
        if (m.kind === "review_invite") {
          const copy = reviewInvitation(o.order_items);
          values.review_subject = copy.subject;
          values.review_body = copy.body;
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
                  consent_version:
                    o.request_payload?.form?.emailConsentVersion ??
                    "order-review-2026-10-14",
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
        if (m.kind === "order_review_reward") {
          const reward = (await getPool().query<{code: string; expires_at: Date; redeemed_at: Date | null; revoked_at: Date | null}>(
            "select code,expires_at,redeemed_at,revoked_at from public.review_rewards where source_order_id=$1 and id=$2", [m.order_id, m.payload.reward_id],
          )).rows[0];
          if (!reward || reward.revoked_at || reward.redeemed_at || reward.expires_at.getTime()<=Date.now()) {
            await db.from("email_messages").update({state:"cancelled",last_error:"Промокод уже недоступен"}).eq("id",m.id).eq("claim",m.claim);
            continue;
          }
          values.promo_code=reward.code;
          values.promo_expires=rewardExpiry(reward.expires_at);
          url=siteUrl("/catalog"); label="Выбрать изделия";
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
      if (m.kind === "collection" && m.payload?.test)
        unsubscribe = siteUrl("/catalog");
      if (marketingKinds.has(m.kind) && !unsubscribe)
        throw new Error("CONSENT");
      const message = {
        to: m.recipient,
        idempotenceKey: m.id,
        ...renderEmail(
          template,
          values,
          url,
          label,
          unsubscribe,
          m.kind.startsWith("order_") && m.kind !== "order_review_reward",
          orderItems,
          parcels,
        ),
        metadata: { message_id: m.id },
      };
      providerAttempted = true;
      const result = await sendEmail(message, m.kind);
      if (result.state === "disabled" || result.state === "unconfigured") {
        providerAttempted = false;
        throw new Error("DISABLED");
      }
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
    } catch (error) {
      // Only failures after a provider attempt are ambiguous. Preparation errors
      // are safe to retry manually and must not be mistaken for sent messages.
      const state = providerAttempted ? "unknown" : "failed";
      if (providerAttempted) unknown++;
      else failed++;
      const reason =
        error instanceof Error &&
        ["TEMPLATE", "ORDER", "CONSENT", "DISABLED"].includes(error.message)
          ? error.message
          : "PREPARATION";
      await db
        .from("email_messages")
        .update({
          state,
          last_error: providerAttempted
            ? "Проверьте доставку перед повтором"
            : `Письмо не отправлялось: ошибка подготовки (${reason})`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", m.id)
        .eq("claim", m.claim)
        .eq("state", "sending");
    }
  }
  return { accepted, failed, unknown };
}

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(value);
}
