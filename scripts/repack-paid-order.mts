// Preview by default. Apply only after publishing the parcel-aware application.
// Uses TARGET_DATABASE_URL with verified TLS, as the existing operations scripts do.
import { randomUUID } from "node:crypto";
import { pool } from "./migration/common";
import { OzonTransport } from "../lib/delivery/ozon-transport";
import { createOzonAdapter } from "../lib/delivery/ozon-adapter";
import {
  packingForParcels,
  parcelContexts,
  shipmentDescription,
  type PackingRule,
  type DeliveryContext,
} from "../lib/delivery/model";
import { postingsFor } from "../lib/delivery/postings";
import { postingInfoSchema } from "../lib/delivery/posting-status";

const orderId = process.argv[2];
const expectedPosting = process.argv[3];
const apply = process.argv.includes("--apply");
if (!/^[0-9a-f-]{36}$/i.test(orderId ?? "") || !expectedPosting)
  throw new Error(
    "Usage: repack-paid-order.ts ORDER_UUID OLD_POSTING [--apply]",
  );
const db = pool("TARGET_DATABASE_URL");
const client = await db.connect();
try {
  const lock = await client.query(
    "select pg_try_advisory_lock(hashtextextended($1,0)) locked",
    [`repack:${orderId}`],
  );
  if (!lock.rows[0].locked) throw new Error("REPLACEMENT_IN_PROGRESS");
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
    order.status !== "confirmed" ||
    order.delivery_details?.provider !== "ozon"
  )
    throw new Error("ORDER_NOT_READY");
  const savedReplacement = shipment.status_history?.replacement;
  if (
    savedReplacement?.old_posting === expectedPosting &&
    savedReplacement.phase === "done"
  ) {
    console.log(
      JSON.stringify({
        alreadyReplaced: true,
        orderNumber: order.order_number,
        postings: shipment.status_history.postings,
      }),
    );
  } else {
    if (
      shipment.posting_number !== expectedPosting ||
      !["created", "creating"].includes(shipment.state)
    )
      throw new Error("OLD_POSTING_MISMATCH");
    if (
      shipment.state === "creating" &&
      savedReplacement?.old_posting !== expectedPosting
    )
      throw new Error("SHIPMENT_IN_PROGRESS");
    const { rows: items } = await client.query(
      "select i.*,p.category_id from order_items i join products p on p.id=i.product_id where i.order_id=$1 order by i.product_id,i.purchase_mode",
      [orderId],
    );
    const { rows: rules } = await client.query(
      "select * from delivery_packing_rules where active",
    );
    const {
      rows: [category],
    } = await client.query("select id from categories where slug='plates'");
    if (!category || items.reduce((sum, i) => sum + i.quantity, 0) < 3)
      throw new Error("MULTIPLE_PLATES_REQUIRED");
    const packing = packingForParcels(
      items.map((i) => ({
        product_id: i.product_id,
        category_id: i.category_id,
        quantity: i.quantity,
        price: Number(i.price),
        purchase_mode: i.purchase_mode,
      })),
      rules as PackingRule[],
      category.id,
    );
    const context: DeliveryContext = {
      phone: order.customer_phone,
      items,
      packing,
      shipmentMethodId: order.delivery_details.shipment_method_id,
    };
    const transport = new OzonTransport(
      process.env.OZON_CLIENT_ID!,
      process.env.OZON_CLIENT_SECRET!,
    );
    const adapter = createOzonAdapter(transport);
    const current = postingInfoSchema
      .parse(
        await transport.call("/v1/posting/info", {
          posting_numbers: [expectedPosting],
        }),
      )
      .postings.find((p) => p.posting_number === expectedPosting);
    if (
      !current ||
      !["created", "forming", "ready_for_shipping", "canceled"].includes(
        current.status,
      )
    )
      throw new Error("OLD_POSTING_ALREADY_SHIPPED");
    if (current.status === "canceled" && !savedReplacement)
      throw new Error("UNEXPECTED_CANCELLATION");
    const parcels = parcelContexts(context);
    const payload = savedReplacement
      ? shipment.request_payload
      : {
          order_external_id: order.order_number,
          recipient: {
            phone_number: order.customer_phone,
            full_name: order.customer_name,
          },
          delivery: {
            delivery_point: {
              delivery_point_id: order.delivery_details.point.id,
            },
          },
          postings: postingsFor(context).map((posting, index) => ({
            ...posting,
            posting_external_id: `${order.order_number}-${index + 1}`,
            description: shipmentDescription(
              parcels[index].items.map((i) => ({
                product_name: items.find(
                  (original) => original.product_id === i.product_id,
                )!.product_name,
                quantity: i.quantity,
              })),
            ),
          })),
        };
    // Quote exactly the body we will create, including after an interrupted attempt.
    const checkout = await transport.call<{
      results: {
        request_id: number;
        error?: unknown;
        posting?: {
          estimated_delivery_cost: { amount: string };
          estimated_insurance_cost: { amount: string };
        };
      }[];
    }>("/v1/order/checkout", payload);
    if (
      payload.postings.some(
        (p: { request_id: number }) =>
          !checkout.results?.some(
            (r) => r.request_id === p.request_id && !r.error && r.posting,
          ),
      )
    )
      throw new Error("PARCEL_QUOTE_FAILED");
    // The adapter independently verifies every currency, amount and delivery estimate.
    const cost = savedReplacement
      ? savedReplacement.cost
      : await adapter.quote(order.delivery_details.point.id, context);
    const replacement = savedReplacement ?? {
      phase: "planned",
      old_posting: expectedPosting,
      cost,
      packing,
      previous: {
        order_number: shipment.order_number,
        posting_number: shipment.posting_number,
        idempotency_key: shipment.idempotency_key,
        request_payload: shipment.request_payload,
        packing: order.delivery_details.packing,
      },
    };
    console.log(
      JSON.stringify({
        apply,
        orderNumber: order.order_number,
        oldPosting: expectedPosting,
        parcels: payload.postings.map(
          (p: {
            description: string;
            declared_value: unknown;
            dimensions: unknown;
          }) => ({
            description: p.description,
            declaredValue: p.declared_value,
            dimensions: p.dimensions,
          }),
        ),
        carrierDelivery: cost.deliveryCost,
        carrierInsurance: cost.insuranceCost,
        customerPaidDelivery:
          Number(order.delivery_amount) + Number(order.insurance_amount),
        extraCarrierCostPaidByStudio:
          Math.round(
            (cost.deliveryCost +
              cost.insuranceCost -
              Number(order.delivery_amount) -
              Number(order.insurance_amount)) *
              100,
          ) / 100,
      }),
    );
    if (apply) {
      const key = savedReplacement ? shipment.idempotency_key : randomUUID();
      if (!savedReplacement)
        await client.query(
          "update order_shipments set state='creating',claimed_at=now(),idempotency_key=$2,request_payload=$3,status_history=coalesce(status_history,'{}'::jsonb)||$4::jsonb,last_error='Замена отправления: используйте repack-paid-order для продолжения.',updated_at=now() where order_id=$1",
          [
            orderId,
            key,
            JSON.stringify(payload),
            JSON.stringify({ replacement }),
          ],
        );
      if (current.status !== "canceled")
        await transport.call("/v1/posting/cancel", {
          posting_number: expectedPosting,
        });
      let canceled = current.status === "canceled";
      for (let attempt = 0; attempt < 6 && !canceled; attempt++) {
        const result = postingInfoSchema.parse(
          await transport.call("/v1/posting/info", {
            posting_numbers: [expectedPosting],
          }),
        );
        canceled = result.postings.some(
          (p) =>
            p.posting_number === expectedPosting && p.status === "canceled",
        );
        if (!canceled)
          await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!canceled) throw new Error("CANCELLATION_PENDING_RERUN_SAME_COMMAND");
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
        throw new Error("CREATION_UNCONFIRMED_RETRY_SAME_COMMAND");
      const primary = response.postings.find((p) => p.request_id === 1)!;
      await client.query("begin");
      try {
        await client.query(
          "update order_shipments set state='created',order_number=$2,posting_number=$3,carrier_status='created',carrier_changed_at=null,status_history=$4,synced_at=null,sync_claim=null,next_sync_at=now(),last_error=null,updated_at=now() where order_id=$1 and idempotency_key=$5",
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
        // Preserve the paid price. Repacking does not create a second purchase or ask for more money.
        await client.query(
          "update orders set delivery_details=jsonb_set(delivery_details,'{packing}',$2::jsonb),tracking_number=$3 where id=$1",
          [
            orderId,
            JSON.stringify(replacement.packing),
            primary.posting_number,
          ],
        );
        await client.query(
          "insert into order_events(order_id,kind,reason) values($1,'notes',$2)",
          [
            orderId,
            `Отправление ${expectedPosting} заменено: ${response.postings.map((p) => p.posting_number).join(", ")}. Стоимость заказа для покупателя сохранена.`,
          ],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
      console.log(
        JSON.stringify({
          replaced: true,
          orderNumber: order.order_number,
          postings: response.postings,
        }),
      );
    }
  }
} finally {
  await client.query("select pg_advisory_unlock(hashtextextended($1,0))", [
    `repack:${orderId}`,
  ]);
  client.release();
  await db.end();
}
