import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ozon, ozonTransport, postingFor } from "./ozon";
import type { DeliveryContext, PackingRule } from "./model";
// Call this after a trusted payment callback and order confirmation, or from the checked admin action.
// A browser payment-success redirect must never call this function or mark an order paid.
export async function createPaidShipment(orderId: string) {
  const db = createServerClient();
  const { data: o, error } = await db
    .from("orders")
    .select("*,items:order_items(*)")
    .eq("id", orderId)
    .single();
  if (error || !o) throw new Error("Заказ не найден.");
  if (
    o.payment_status !== "paid" ||
    o.status !== "confirmed" ||
    o.delivery_details?.provider !== "ozon"
  )
    throw new Error("Сначала подтвердите заказ и поступление оплаты.");
  const details = o.delivery_details;
  const { data: existing, error: shipmentError } = await db
    .from("order_shipments")
    .select("*")
    .eq("order_id", orderId)
    .single();
  if (shipmentError) throw new Error("Не удалось проверить отправление.");
  if (existing.state === "created") return "Отправление уже создано.";
  if (
    existing.state === "creating" &&
    Date.parse(existing.claimed_at) > Date.now() - 120000
  )
    throw new Error(
      "Отправление уже создаётся. Проверьте статус немного позже.",
    );
  // Freeze the body before the first attempt; a timeout is retried with the same key AND body.
  let payload = existing.request_payload;
  if (!payload) {
    const items = o.items.map(
      (i: {
        product_id: string;
        quantity: number;
        price: number;
        purchase_mode: string;
      }) => ({ ...i, category_id: "" }),
    );
    const context: DeliveryContext = {
      phone: o.customer_phone,
      items,
      packing: details.packing as PackingRule,
      shipmentMethodId: details.shipment_method_id,
      ...(details.cutoff_at ? { cutoffAt: details.cutoff_at } : {}),
    };
    await ozon.checkRecipient(context.phone);
    const cost = await ozon.quote(details.point.id, context);
    if (
      Math.round((cost.deliveryCost + cost.insuranceCost) * 100) !==
      Math.round((Number(o.delivery_amount) + Number(o.insurance_amount)) * 100)
    )
      throw new Error(
        "Расходы доставки изменились. Согласуйте разницу с покупателем перед созданием отправления.",
      );
    const posting = {
      ...postingFor(context),
      posting_external_id: orderId + "-1",
      description: o.items
        .map(
          (i: { product_name: string; quantity: number }) =>
            `${i.product_name} × ${i.quantity}`,
        )
        .join("; ")
        .slice(0, 500),
    };
    payload = {
      order_external_id: orderId,
      recipient: { phone_number: o.customer_phone, full_name: o.customer_name },
      delivery: { delivery_point: { delivery_point_id: details.point.id } },
      postings: [posting],
    };
  }
  const { data: claim, error: claimError } = await db.rpc(
    "claim_delivery_shipment",
    { p_order: orderId, p_payload: payload },
  );
  if (claimError)
    throw new Error("Заказ не готов к отправке или отправление уже создаётся.");
  if (!claim) return "Отправление уже создано.";
  try {
    const response = await ozonTransport().call<{
      order_number: string;
      postings: { posting_number: string; request_id: number }[];
    }>("/v1/order/create", claim.request_payload, claim.idempotency_key);
    const posting = response.postings?.find((p) => p.request_id === 1);
    if (!response.order_number || !posting?.posting_number)
      throw new Error(
        "Не удалось подтвердить создание отправления. Повторите с тем же заказом.",
      );
    const { error: saveError } = await db
      .from("order_shipments")
      .update({
        state: "created",
        order_number: response.order_number,
        posting_number: posting.posting_number,
        carrier_status: "created",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .eq("idempotency_key", claim.idempotency_key);
    if (saveError)
      throw new Error(
        "Ozon ответил, но результат не сохранён. Повторите с тем же заказом.",
      );
    return "Отправление создано. Перед отгрузкой подтвердите готовность в кабинете Ozon.";
  } catch (e) {
    await db
      .from("order_shipments")
      .update({
        state: "failed",
        last_error:
          "Не удалось подтвердить создание. Повтор выполняется с тем же ключом.",
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .eq("idempotency_key", claim.idempotency_key);
    throw e;
  }
}
export async function refreshShipmentStatus(orderId: string) {
  const db = createServerClient();
  const { data: s, error } = await db
    .from("order_shipments")
    .select("posting_number")
    .eq("order_id", orderId)
    .single();
  if (error || !s?.posting_number)
    throw new Error("Отправление ещё не создано.");
  const result = await ozonTransport().call<{
    postings: { posting_number: string; status: string }[];
  }>("/v1/posting/info", { posting_numbers: [s.posting_number] });
  const posting = result.postings?.find(
    (p) => p.posting_number === s.posting_number,
  );
  if (!posting?.status) throw new Error("Статус не получен.");
  const history = await ozonTransport().call<unknown>(
    "/v1/posting/status-history",
    { posting_number: s.posting_number },
  );
  const { error: saveError } = await db
    .from("order_shipments")
    .update({
      carrier_status: posting.status,
      status_history: history,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId);
  if (saveError) throw new Error("Статус не сохранён.");
}
