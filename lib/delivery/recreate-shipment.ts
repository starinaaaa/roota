import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { OzonTransport } from "./ozon-transport";
import { createOzonAdapter } from "./ozon-adapter";
import {
  packingForParcels,
  type DeliveryContext,
  type PackingRule,
} from "./model";
import { shipmentPostings } from "./parcel-status";
import { postingInfoSchema } from "./posting-status";
import { shipmentPayload, type ShipmentItem } from "./shipment-payload";

type Options = {
  db: Pick<Pool, "connect">;
  transport: Pick<OzonTransport, "call">;
  orderId: string;
  expectedPosting: string;
  apply?: boolean;
  allowActive?: boolean;
};
export async function recreatePaidShipment({
  db,
  transport,
  orderId,
  expectedPosting,
  apply = false,
  allowActive = false,
}: Options) {
  const client = await db.connect();
  let locked = false;
  try {
    locked = (
      await client.query(
        "select pg_try_advisory_lock(hashtextextended($1,0)) locked",
        [`repack:${orderId}`],
      )
    ).rows[0].locked;
    if (!locked) throw new Error("Замена отправлений уже выполняется.");
    const {
      rows: [order],
    } = await client.query("select * from orders where id=$1", [orderId]);
    const {
      rows: [shipment],
    } = await client.query("select * from order_shipments where order_id=$1", [
      orderId,
    ]);
    if (
      !order ||
      !shipment ||
      order.payment_status !== "paid" ||
      !["new", "confirmed", "in_production"].includes(order.status) ||
      order.delivery_details?.provider !== "ozon"
    )
      throw new Error(
        "Нужен оплаченный заказ, который ещё не передан в доставку.",
      );
    const previousReplacement = shipment.status_history?.replacement;
    if (shipment.posting_number !== expectedPosting) {
      if (
        previousReplacement?.old_posting === expectedPosting &&
        previousReplacement.phase === "done"
      )
        return {
          alreadyReplaced: true,
          orderNumber: order.order_number,
          postings: shipmentPostings(shipment),
        };
      throw new Error("Номер отправления изменился. Обновите карточку заказа.");
    }
    const pending =
      previousReplacement && previousReplacement.phase !== "done"
        ? previousReplacement
        : null;
    if (pending && pending.old_posting !== expectedPosting)
      throw new Error("Сначала завершите предыдущую замену.");
    if (!pending && shipment.state !== "created")
      throw new Error("Дождитесь завершения создания отправления.");
    const { rows: rawItems } = await client.query(
      "select i.*,p.category_id,c.name as category_name,c.slug as category_slug from order_items i left join products p on p.id=i.product_id left join categories c on c.id=p.category_id where i.order_id=$1 order by i.product_id,i.purchase_mode",
      [orderId],
    );
    const items: ShipmentItem[] = rawItems.map((i) => ({
      product_id: i.product_id,
      category_id: i.category_id ?? "",
      quantity: i.quantity,
      price: Number(i.price),
      purchase_mode: i.purchase_mode,
      product_name: i.product_name,
      category: { name: i.category_name, slug: i.category_slug },
    }));
    if (!items.length) throw new Error("Состав заказа пуст.");
    const { rows: rules } = await client.query(
      "select * from delivery_packing_rules where active",
    );
    const {
      rows: [plateCategory],
    } = await client.query("select id from categories where slug='plates'");
    const packing = pending?.packing ?? {
      ...packingForParcels(
        items,
        rules as PackingRule[],
        plateCategory?.id ?? "plates",
      ),
      ...(order.delivery_details.packing?.delivery_packaging_fee !== undefined
        ? {
            delivery_packaging_fee: Number(
              order.delivery_details.packing.delivery_packaging_fee,
            ),
          }
        : {}),
    };
    const context: DeliveryContext = {
      phone: order.customer_phone,
      items,
      packing,
      shipmentMethodId: order.delivery_details.shipment_method_id,
    };
    const key: string = pending ? shipment.idempotency_key : randomUUID();
    const oldPostings = pending?.old_postings ?? shipmentPostings(shipment);
    const payload = pending
      ? shipment.request_payload
      : shipmentPayload(
          order,
          order.delivery_details.point.id,
          context,
          items,
          `R${key.slice(0, 8)}`,
        );
    const info = postingInfoSchema.parse(
      await transport.call("/v1/posting/info", {
        posting_numbers: oldPostings.map(
          (p: { posting_number: string }) => p.posting_number,
        ),
      }),
    );
    const oldStatuses = oldPostings.map((p: { posting_number: string }) =>
      info.postings.find((r) => r.posting_number === p.posting_number),
    );
    if (
      oldStatuses.some(
        (p: (typeof info.postings)[number] | undefined) =>
          !p ||
          !["created", "forming", "ready_for_shipping", "canceled"].includes(
            p.status,
          ),
      )
    )
      throw new Error(
        "Отправление уже передано в доставку или его статус не подтверждён.",
      );
    if (
      !allowActive &&
      oldStatuses.some(
        (p: (typeof info.postings)[number]) => p.status !== "canceled",
      )
    )
      throw new Error(
        "Сначала отмените все посылки заказа в Ozon и обновите статус.",
      );
    const cost =
      pending?.cost ??
      (await createOzonAdapter(transport).quote(
        order.delivery_details.point.id,
        context,
      ));
    const extraCarrierCost =
      Math.round(
        (cost.deliveryCost +
          cost.insuranceCost -
          Number(order.delivery_amount) -
          Number(order.insurance_amount) +
          Number(order.delivery_details.packing?.delivery_packaging_fee ?? 0)) *
          100,
      ) / 100;
    const replacement = pending ?? {
      phase: "planned",
      old_posting: expectedPosting,
      old_postings: oldPostings,
      packing,
      cost,
      extra_carrier_cost: extraCarrierCost,
      previous: {
        order_number: shipment.order_number,
        posting_number: shipment.posting_number,
        idempotency_key: shipment.idempotency_key,
        request_payload: shipment.request_payload,
        packing: order.delivery_details.packing,
        status_history: shipment.status_history,
      },
    };
    const preview = {
      orderNumber: order.order_number,
      oldPostings: oldPostings.map(
        (p: { posting_number: string }) => p.posting_number,
      ),
      parcels: payload.postings,
      carrierDelivery: cost.deliveryCost,
      carrierInsurance: cost.insuranceCost,
      extraCarrierCostPaidByStudio: extraCarrierCost,
    };
    if (!apply) return { preview: true, ...preview };
    // Compare-and-swap prevents a stale preview or a competing creator/synchronizer from being overwritten.
    const frozen = await client.query(
      "update order_shipments set state='creating',claimed_at=now(),idempotency_key=$2,request_payload=$3,status_history=$4,sync_claim=null,last_error='Выполняется замена отправлений.',updated_at=now() where order_id=$1 and idempotency_key=$5 and state=$6 returning order_id",
      [
        orderId,
        key,
        JSON.stringify(payload),
        JSON.stringify({ replacement }),
        shipment.idempotency_key,
        shipment.state,
      ],
    );
    if (!frozen.rows.length)
      throw new Error("Отправление изменилось. Повторите проверку.");
    for (const posting of oldStatuses)
      if (posting.status !== "canceled")
        await transport.call("/v1/posting/cancel", {
          posting_number: posting.posting_number,
        });
    let canceled = false;
    for (let attempt = 0; attempt < 8 && !canceled; attempt++) {
      const result = postingInfoSchema.parse(
        await transport.call("/v1/posting/info", {
          posting_numbers: oldPostings.map(
            (p: { posting_number: string }) => p.posting_number,
          ),
        }),
      );
      canceled = oldPostings.every((p: { posting_number: string }) =>
        result.postings.some(
          (r) =>
            r.posting_number === p.posting_number && r.status === "canceled",
        ),
      );
      if (!canceled) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    if (!canceled)
      throw new Error(
        "Ozon ещё отменяет посылки. Повторите ту же операцию позже.",
      );
    const response = await transport.call<{
      order_number: string;
      postings: { request_id: number; posting_number: string }[];
    }>("/v1/order/create", payload, key);
    if (
      !response.order_number ||
      response.postings?.length !== payload.postings.length ||
      new Set(response.postings.map((p) => p.posting_number)).size !==
        payload.postings.length ||
      !payload.postings.every(
        (p: { request_id: number }) =>
          response.postings.filter(
            (r) => r.request_id === p.request_id && r.posting_number,
          ).length === 1,
      )
    )
      throw new Error(
        "Не удалось подтвердить создание. Повторите ту же операцию с сохранённым ключом.",
      );
    const primary = response.postings.find((p) => p.request_id === 1)!;
    await client.query("begin");
    try {
      const saved = await client.query(
        "update order_shipments set state='created',order_number=$2,posting_number=$3,carrier_status='created',carrier_changed_at=null,status_history=$4,synced_at=null,sync_claim=null,next_sync_at=now(),last_error=null,updated_at=now() where order_id=$1 and idempotency_key=$5 returning order_id",
        [
          orderId,
          response.order_number,
          primary.posting_number,
          JSON.stringify({
            postings: response.postings,
            replacement: {
              ...replacement,
              phase: "done",
              completed_at: new Date().toISOString(),
            },
          }),
          key,
        ],
      );
      if (!saved.rows.length)
        throw new Error("Результат не сохранён. Повторите с тем же заказом.");
      // Preserve payment/order status, reservation and the customer's original price.
      await client.query(
        "update orders set delivery_details=jsonb_set(delivery_details,'{packing}',$2::jsonb),tracking_number=$3,delivery_stage='preparing' where id=$1",
        [orderId, JSON.stringify(packing), primary.posting_number],
      );
      await client.query(
        "insert into order_events(order_id,kind,reason) values($1,'notes',$2)",
        [
          orderId,
          `Отправления ${preview.oldPostings.join(", ")} заменены: ${response.postings.map((p) => p.posting_number).join(", ")}. Сумма для покупателя сохранена. Дополнительный расход перевозчика: ${extraCarrierCost} ₽.`,
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    return { replaced: true, ...preview, postings: response.postings };
  } finally {
    if (locked)
      await client.query("select pg_advisory_unlock(hashtextextended($1,0))", [
        `repack:${orderId}`,
      ]);
    client.release();
  }
}
