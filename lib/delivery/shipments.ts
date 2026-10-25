import "server-only";
import { createServerClient } from "@/lib/db";
import { ozon, ozonTransport } from "./ozon";
import { postingInfoSchema, postingHistorySchema } from "./posting-status";
import { type DeliveryContext, type PackingRule } from "./model";
import { shipmentPayload } from "./shipment-payload";
import { shipmentPostings, aggregatePostingStatus } from "./parcel-status";
// Call this after a trusted payment callback and order confirmation, or from the checked admin action.
// A browser payment-success redirect must never call this function or mark an order paid.
export async function createPaidShipment(orderId: string) {
  if (
    process.env.APP_ENV !== "production" ||
    process.env.OZON_SHIPMENTS_ENABLED !== "true"
  )
    throw new Error(
      "Создание реальных отправлений отключено для этого окружения.",
    );
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
  if (
    existing.status_history?.replacement &&
    existing.status_history.replacement.phase !== "done"
  )
    throw new Error(
      "Выполняется замена отправлений. Завершите её перед повторным созданием.",
    );
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
    const [productsResult, categoriesResult] = await Promise.all([
      db
        .from("products")
        .select("id,category_id")
        .in(
          "id",
          o.items.map((i: { product_id: string }) => i.product_id),
        ),
      db.from("categories").select("id,name,slug"),
    ]);
    if (productsResult.error || categoriesResult.error)
      throw new Error("Не удалось проверить категории изделий.");
    const items = o.items.map(
      (i: {
        product_id: string;
        quantity: number;
        price: number;
        purchase_mode: string;
        product_name: string;
        configuration?: import("@/lib/garden").GardenConfiguration | null;
      }) => {
        const categoryId = productsResult.data?.find(
          (p) => p.id === i.product_id,
        )?.category_id;
        return {
          ...i,
          category_id: categoryId ?? "",
          category: categoriesResult.data?.find((c) => c.id === categoryId),
        };
      },
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
    // Compare the carrier tariff against the carrier share of the paid price.
    // Old orders have no packaging fee; never apply today's fee retroactively.
    const packagingFee = Number(details.packing?.delivery_packaging_fee ?? 0);
    if (
      Math.round((cost.deliveryCost + cost.insuranceCost) * 100) !==
      Math.round(
        (Number(o.delivery_amount) -
          packagingFee +
          Number(o.insurance_amount)) *
          100,
      )
    )
      throw new Error(
        "Расходы доставки изменились. Согласуйте разницу с покупателем перед созданием отправления.",
      );
    payload = shipmentPayload(o, details.point.id, context, items);
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
    const expected = claim.request_payload.postings as { request_id: number }[];
    if (
      !response.order_number ||
      !posting?.posting_number ||
      response.postings.length !== expected.length ||
      new Set(response.postings.map((p) => p.posting_number)).size !==
        expected.length ||
      !expected.every(
        (p) =>
          response.postings.filter(
            (r) => r.request_id === p.request_id && r.posting_number,
          ).length === 1,
      )
    )
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
        status_history: { postings: response.postings },
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
    .select("posting_number,status_history")
    .eq("order_id", orderId)
    .single();
  if (error || !s?.posting_number)
    throw new Error("Отправление ещё не создано.");
  if (
    s.status_history?.replacement &&
    s.status_history.replacement.phase !== "done"
  )
    throw new Error(
      "Выполняется замена отправлений. Статус будет доступен после завершения.",
    );
  const transport = ozonTransport();
  const result = postingInfoSchema.parse(
    await transport.call("/v1/posting/info", {
      posting_numbers: shipmentPostings(s).map((p) => p.posting_number),
    }),
  );
  const expected = shipmentPostings(s);
  const postings = expected.map((p) =>
    result.postings.find((r) => r.posting_number === p.posting_number),
  );
  if (postings.some((p) => !p))
    throw new Error(
      "Ozon не нашёл отправление. Проверьте его номер и аккаунт Ozon.",
    );
  let history = {};
  try {
    history = postingHistorySchema.parse(
      await transport.call("/v1/posting/status-history", {
        posting_number: s.posting_number,
      }),
    );
  } catch {
    /* Current status remains useful when history is unavailable. */
  }
  const { error: saveError } = await db.rpc("apply_order_shipment_status", {
    p_order: orderId,
    p_posting: s.posting_number,
    p_status: aggregatePostingStatus(postings as typeof result.postings),
    p_changed: postings
      .map((p) => p!.status_changed_at)
      .sort()
      .at(-1),
    p_history: {
      ...s.status_history,
      ...history,
      postings: expected.map((p) => ({
        ...p,
        ...postings.find((r) => r!.posting_number === p.posting_number),
      })),
    },
  });
  if (saveError) throw new Error("Статус не сохранён.");
}
