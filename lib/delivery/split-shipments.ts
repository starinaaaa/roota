import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { OzonTransport } from "./ozon-transport";
import { shipmentPayload, type ShipmentItem } from "./shipment-payload";
import {
  moneyToKopecks,
  type DeliveryContext,
  type PackingRule,
} from "./model";
import { groupForRequest, type DispatchGroup } from "./split-dispatch";
import { shipmentPostings, type CarrierPosting } from "./parcel-status";
import { z } from "zod";
const creationResult = z.object({
  order_number: z.string().min(1),
  postings: z
    .array(
      z.object({
        request_id: z.number().int(),
        posting_number: z.string().min(1),
      }),
    )
    .min(1),
});

// Two independent Ozon orders, one paid Roota order. No approval/cancellation/refund calls.
export async function createReadyDispatch(
  db: Pick<Pool, "connect">,
  transport: Pick<OzonTransport, "call">,
  orderId: string,
) {
  const client = await db.connect();
  let locked = false,
    inTransaction = false;
  try {
    locked = (
      await client.query(
        "select pg_try_advisory_lock(hashtextextended($1,0)) locked",
        [`split-dispatch:${orderId}`],
      )
    ).rows[0].locked;
    if (!locked)
      throw new Error("Отправления уже создаются. Обновите карточку позже.");
    await client.query("BEGIN");
    inTransaction = true;
    const order = (
      await client.query("select * from orders where id=$1 for update", [
        orderId,
      ])
    ).rows[0];
    if (
      !order ||
      order.payment_status !== "paid" ||
      order.delivery_details?.provider !== "ozon" ||
      !["confirmed", "shipped"].includes(order.status) ||
      !order.delivery_details?.packing?.split_dispatch
    )
      throw new Error(
        "Сначала подтвердите оплаченный заказ с раздельной отправкой.",
      );
    const shipment = (
      await client.query(
        "select * from order_shipments where order_id=$1 for update",
        [orderId],
      )
    ).rows[0];
    if (
      !shipment ||
      (shipment.status_history?.replacement &&
        shipment.status_history.replacement.phase !== "done")
    )
      throw new Error("Проверьте состояние отправлений.");
    const batches = (
      await client.query(
        "select * from delivery_dispatch_batches where order_id=$1 order by dispatch_group",
        [orderId],
      )
    ).rows;
    const group: DispatchGroup = batches.some(
      (b) => b.dispatch_group === "stock" && b.state === "created",
    )
      ? "preorder"
      : "stock";
    const old = batches.find((b) => b.dispatch_group === group);
    if (old?.state === "created") {
      await client.query("COMMIT");
      inTransaction = false;
      return "Все этапы отправки уже оформлены.";
    }
    if (
      old?.state === "creating" &&
      Date.parse(old.claimed_at) > Date.now() - 120000
    )
      throw new Error(
        "Создание уже выполняется. Повторите проверку через две минуты.",
      );
    if (group === "preorder") {
      const notReady = (
        await client.query(
          `select count(*)::int as count from order_items i left join production_tasks t on t.order_item_id=i.id where i.order_id=$1 and i.purchase_mode='preorder' and (t.id is null or t.stage<>'ready')`,
          [orderId],
        )
      ).rows[0].count;
      if (notReady)
        throw new Error(
          "Готовые изделия уже оформлены. Отметьте готовность всех изделий предзаказа в разделе «Изготовление», затем создайте вторую отправку.",
        );
    }
    const packing = order.delivery_details.packing as PackingRule;
    const rawItems = (
      await client.query(
        `select i.*,p.category_id,c.name as category_name,c.slug as category_slug from order_items i left join products p on p.id=i.product_id left join categories c on c.id=p.category_id where i.order_id=$1 order by i.id`,
        [orderId],
      )
    ).rows;
    const items: ShipmentItem[] = rawItems.map((i) => ({
      ...i,
      price: Number(i.price),
      category: { name: i.category_name, slug: i.category_slug },
    }));
    const context: DeliveryContext = {
      phone: order.customer_phone,
      items,
      packing,
      shipmentMethodId: order.delivery_details.shipment_method_id,
    };
    const allPayload = shipmentPayload(
      order,
      order.delivery_details.point.id,
      context,
      items,
    );
    const groupPostings = allPayload.postings
      .filter((p) => groupForRequest(packing, p.request_id) === group)
      .map((p) => {
        const ready = { ...p };
        delete ready.cutoff_at;
        return ready;
      });
    if (!groupPostings.length)
      throw new Error("План раздельной отправки не найден.");
    const costs = packing.dispatch_costs?.filter(
      (p) => groupForRequest(packing, p.request_id) === group,
    );
    if (costs?.length !== groupPostings.length)
      throw new Error(
        "Не найден сохранённый расчёт этапа. Свяжитесь с разработчиком перед отправкой.",
      );
    const quoted = Math.round(
      costs.reduce((sum, p) => sum + p.deliveryCost + p.insuranceCost, 0) * 100,
    );
    const key = old?.idempotency_key ?? randomUUID();
    const payload = (old?.request_sent_at ? old.request_payload : null) ?? {
      ...allPayload,
      order_external_id: `${order.order_number}-${group}`,
      postings: groupPostings,
    };
    await client.query(
      `insert into delivery_dispatch_batches(order_id,dispatch_group,idempotency_key,request_payload,state,claimed_at) values($1,$2,$3,$4,'creating',now()) on conflict(order_id,dispatch_group) do update set state='creating',request_payload=excluded.request_payload,claimed_at=now(),last_error=null`,
      [orderId, group, key, JSON.stringify(payload)],
    );
    await client.query("COMMIT");
    inTransaction = false;
    try {
      if (!old?.request_sent_at) {
        const quote = await transport.call<{
          results: {
            request_id: number;
            posting?: {
              estimated_delivery_cost: {
                amount: string;
                currency_code: string;
              };
              estimated_insurance_cost: {
                amount: string;
                currency_code: string;
              };
            };
            error?: unknown;
          }[];
        }>("/v1/order/checkout", {
          recipient: { phone_number: order.customer_phone },
          delivery: payload.delivery,
          postings: (
            payload.postings as ReturnType<typeof shipmentPayload>["postings"]
          ).map((p) => ({
            request_id: p.request_id,
            shipment_method_id: p.shipment_method_id,
            declared_value: p.declared_value,
            dimensions: p.dimensions,
          })),
        });
        let actual = 0;
        for (const posting of payload.postings) {
          const result = quote.results?.find(
            (r) => r.request_id === posting.request_id,
          );
          if (
            !result?.posting ||
            result.error ||
            result.posting.estimated_delivery_cost.currency_code !== "RUB" ||
            result.posting.estimated_insurance_cost.currency_code !== "RUB"
          )
            throw new Error("Не удалось перепроверить цену выбранного этапа.");
          actual +=
            moneyToKopecks(result.posting.estimated_delivery_cost.amount) +
            moneyToKopecks(result.posting.estimated_insurance_cost.amount);
        }
        if (actual > quoted)
          throw new Error(
            "Стоимость этого этапа выросла. Согласуйте разницу до создания отправления; покупателю автоматически ничего не начисляется.",
          );
      }
      await client.query(
        `update delivery_dispatch_batches set request_sent_at=coalesce(request_sent_at,now()) where order_id=$1 and dispatch_group=$2`,
        [orderId, group],
      );
      const response = creationResult.parse(
        await transport.call("/v1/order/create", payload, key),
      );
      const expected = payload.postings.map(
        (p: { request_id: number }) => p.request_id,
      );
      if (
        response.postings.length !== expected.length ||
        new Set(response.postings.map((p) => p.posting_number)).size !==
          expected.length ||
        !expected.every(
          (id: number) =>
            response.postings.filter((p) => p.request_id === id).length === 1,
        )
      )
        throw new Error(
          "Не удалось подтвердить полный состав отправлений. Повторите с тем же этапом.",
        );
      await client.query("BEGIN");
      inTransaction = true;
      await client.query("select id from orders where id=$1 for update", [
        orderId,
      ]);
      const fresh = (
        await client.query(
          "select * from order_shipments where order_id=$1 for update",
          [orderId],
        )
      ).rows[0];
      const existing = shipmentPostings(fresh);
      const now = new Date().toISOString();
      const created: CarrierPosting[] = response.postings.map((p) => ({
        ...p,
        status: "created",
        status_changed_at: now,
      }));
      if (
        existing.some((p) =>
          created.some(
            (n) =>
              n.request_id === p.request_id &&
              n.posting_number !== p.posting_number,
          ),
        )
      )
        throw new Error("План посылок изменился. Проверьте номера в Ozon.");
      const merged = [
        ...existing.filter(
          (p) => !created.some((n) => n.request_id === p.request_id),
        ),
        ...created,
      ].sort((a, b) => a.request_id - b.request_id);
      await client.query(
        `update delivery_dispatch_batches set state='created',result=$3,last_error=null where order_id=$1 and dispatch_group=$2`,
        [orderId, group, JSON.stringify(response)],
      );
      await client.query(
        `update order_shipments set state='created',posting_number=coalesce(posting_number,$2),order_number=coalesce(order_number,$3),request_payload=$4,
        status_history=jsonb_set(coalesce(status_history,'{}'::jsonb),'{postings}',$5::jsonb),carrier_status='created',last_error=null,next_sync_at=now(),updated_at=now()
        where order_id=$1`,
        [
          orderId,
          response.postings[0].posting_number,
          response.order_number,
          JSON.stringify(allPayload),
          JSON.stringify(merged),
        ],
      );
      await client.query("COMMIT");
      inTransaction = false;
      return group === "stock"
        ? "Готовые изделия оформлены отдельной отправкой. Предзаказ оформите после изготовления. Готовность к отгрузке и этикетки подтвердите в Ozon."
        : "Отправления предзаказа созданы. Подтвердите готовность к отгрузке и получите этикетки в Ozon.";
    } catch (error) {
      if (inTransaction) {
        await client.query("ROLLBACK");
        inTransaction = false;
      }
      // Keep the frozen payload/key after an ambiguous network result. Never silently recreate it.
      await client.query(
        `update delivery_dispatch_batches set last_error='Создание не подтверждено. Повтор использует прежний ключ и тело запроса.' where order_id=$1 and dispatch_group=$2`,
        [orderId, group],
      );
      throw error;
    }
  } finally {
    let discard = false;
    try {
      if (inTransaction) await client.query("ROLLBACK");
      if (locked)
        await client.query(
          "select pg_advisory_unlock(hashtextextended($1,0))",
          [`split-dispatch:${orderId}`],
        );
    } catch {
      discard = true;
    }
    client.release(discard);
  }
}
