import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { splitDispatchPacking } from "../lib/delivery/split-dispatch";
import { createReadyDispatch } from "../lib/delivery/split-shipments";
import { postingsFor } from "../lib/delivery/postings";
import {
  packagingFeeFor,
  packingForParcels,
  type DeliveryContext,
  type PackingRule,
} from "../lib/delivery/model";
import { suggestAddresses } from "../lib/address-suggestions";
const rule: PackingRule = {
  id: randomUUID(),
  name: "one",
  active: true,
  composition: [{ category_id: "plates", quantity: 1 }],
  weight_g: 600,
  length_mm: 265,
  width_mm: 255,
  height_mm: 65,
  updated_at: new Date().toISOString(),
};
const stock = {
  product_id: randomUUID(),
  category_id: "plates",
  quantity: 1,
  price: 6000,
  purchase_mode: "stock",
};
const preorder = {
  ...stock,
  product_id: randomUUID(),
  price: 3900,
  purchase_mode: "preorder",
};

test("split plan never mixes stock and preorder, quotes both and preserves individual cutoff dates", () => {
  const packing = splitDispatchPacking([preorder, stock], [rule], "plates");
  assert.deepEqual(
    packing.parcels?.map((p) => p.dispatch_group),
    ["stock", "preorder"],
  );
  packing.parcels![0].cutoff_at = "2026-10-28T12:00:00Z";
  packing.parcels![1].cutoff_at = "2026-11-18T12:00:00Z";
  const context: DeliveryContext = {
    phone: "test",
    items: [preorder, stock],
    packing,
    shipmentMethodId: 7,
  };
  const postings = postingsFor(context);
  assert.equal(postings.length, 2);
  assert.equal(postings[0].cutoff_at, packing.parcels![0].cutoff_at);
  assert.equal(postings[1].cutoff_at, packing.parcels![1].cutoff_at);
  assert.equal(
    postings.reduce((sum, p) => sum + Number(p.declared_value.amount), 0),
    9900,
  );
  assert.throws(
    () => splitDispatchPacking([stock], [rule], "plates"),
    /готовые изделия/,
  );
});

test("two stages have separate idempotency, pending preorder prevents full delivery and waits for readiness", async () => {
  const sql = new PGlite();
  try {
    await sql.exec(await readFile("database/schema.sql", "utf8"));
    for (const file of [
      "20261028_delivery_tracking_returns.sql",
      "20261028_split_dispatch.sql",
    ]) {
      const migration = await readFile(`database/migrations/${file}`, "utf8");
      await sql.exec(migration);
      await sql.exec(migration);
    }
    const orderId = randomUUID(),
      itemId = randomUUID();
    const packing = splitDispatchPacking([preorder, stock], [rule], "plates");
    packing.dispatch_costs = [
      { request_id: 1, deliveryCost: 121, insuranceCost: 36 },
      { request_id: 2, deliveryCost: 121, insuranceCost: 36 },
    ];
    await sql.query(
      `insert into categories(id,name,slug) values($1,'Тарелки','plates')`,
      [randomUUID()],
    );
    const category = (
      await sql.query<{ id: string }>("select id from categories limit 1")
    ).rows[0].id;
    for (const product of [stock, preorder])
      await sql.query(
        `insert into products(id,name,slug,price,category_id,stock_qty,in_stock,preorder_enabled,lead_time_days) values($1,'Изделие',$2,$3,$4,100,true,true,21)`,
        [product.product_id, product.product_id, product.price, category],
      );
    await sql.query(
      `insert into orders(id,order_number,customer_name,customer_phone,total_amount,delivery_type,status,payment_status,delivery_details) values($1,'GL-SPLIT','Test','Test',10464,'russia','confirmed','paid',$2)`,
      [
        orderId,
        JSON.stringify({
          provider: "ozon",
          point: { id: 7 },
          shipment_method_id: 7,
          packing,
        }),
      ],
    );
    for (const product of [stock, preorder])
      await sql.query(
        `insert into order_items(id,order_id,product_id,quantity,price,product_name,purchase_mode) values($1,$2,$3,1,$4,'Изделие',$5)`,
        [
          product.purchase_mode === "preorder" ? itemId : randomUUID(),
          orderId,
          product.product_id,
          product.price,
          product.purchase_mode,
        ],
      );
    await sql.query(`insert into order_shipments(order_id) values($1)`, [
      orderId,
    ]);
    // Production tables are installed by the existing shop-workspace migration in production.
    await sql.exec(
      `create table production_tasks(id uuid default gen_random_uuid(),order_item_id uuid,stage text)`,
    );
    await sql.query(
      `insert into production_tasks(order_item_id,stage) values($1,'drying')`,
      [itemId],
    );
    const db = {
      connect: async () => ({
        query: async (q: string, args?: unknown[]) =>
          /pg_try_advisory_lock/.test(q)
            ? { rows: [{ locked: true }] }
            : /pg_advisory_unlock/.test(q)
              ? { rows: [{}] }
              : sql.query(q, args),
        release: () => {},
      }),
    } as unknown as Pick<Pool, "connect">;
    const calls: { path: string; key?: string; body: unknown }[] = [];
    let loseFirst = true;
    const transport = {
      async call<T>(path: string, body: unknown, key?: string): Promise<T> {
        calls.push({ path, key, body: structuredClone(body) });
        const postings = (body as { postings: { request_id: number }[] })
          .postings;
        if (path === "/v1/order/checkout")
          return {
            results: postings.map((p) => ({
              request_id: p.request_id,
              posting: {
                estimated_delivery_cost: {
                  amount: "121.00",
                  currency_code: "RUB",
                },
                estimated_insurance_cost: {
                  amount: "36.00",
                  currency_code: "RUB",
                },
              },
            })),
          } as T;
        assert.equal(path, "/v1/order/create");
        if (loseFirst) {
          loseFirst = false;
          throw new Error("response lost");
        }
        return {
          order_number: `OZON-${postings[0].request_id}`,
          postings: postings.map((p) => ({
            request_id: p.request_id,
            posting_number: `BOX-${p.request_id}`,
          })),
        } as T;
      },
    };
    await assert.rejects(
      createReadyDispatch(db, transport, orderId),
      /response lost/,
    );
    await sql.exec(
      `update delivery_dispatch_batches set claimed_at=now()-interval '3 minutes'`,
    );
    await createReadyDispatch(db, transport, orderId);
    const quoteBody = calls.find((c) => c.path === "/v1/order/checkout")!
      .body as { postings: Record<string, unknown>[] };
    assert.ok(
      quoteBody.postings.every(
        (p) =>
          !("description" in p) &&
          !("posting_external_id" in p) &&
          !("cutoff_at" in p),
      ),
    );
    const retries = calls.filter((c) => c.path === "/v1/order/create");
    assert.equal(retries.length, 2);
    assert.equal(retries[0].key, retries[1].key);
    assert.deepEqual(retries[0].body, retries[1].body);
    assert.equal(
      calls.filter((c) => c.path === "/v1/order/checkout").length,
      1,
    );
    await assert.rejects(
      createReadyDispatch(db, transport, orderId),
      /готовность/,
    );
    assert.equal(calls.filter((c) => c.path === "/v1/order/create").length, 2);
    await assert.rejects(
      sql.query(`select change_order($1,'cancelled','paid','','','',$2)`, [
        orderId,
        randomUUID(),
      ]),
      /RETURN_REQUIRED/,
    );
    await assert.rejects(
      sql.query(`select change_order($1,'delivered','paid','','','',$2)`, [
        orderId,
        randomUUID(),
      ]),
      /SPLIT_INCOMPLETE/,
    );
    const shipment = (
      await sql.query<{
        status_history: {
          postings: { posting_number: string; request_id: number }[];
        };
      }>(`select status_history from order_shipments where order_id=$1`, [
        orderId,
      ])
    ).rows[0];
    await sql.query(
      `select apply_order_shipment_status($1,'BOX-1','delivered',now(),$2,null)`,
      [
        orderId,
        JSON.stringify({
          ...shipment.status_history,
          postings: [
            {
              posting_number: "BOX-1",
              request_id: 1,
              status: "delivered",
              status_changed_at: new Date().toISOString(),
            },
          ],
        }),
      ],
    );
    assert.equal(
      (
        await sql.query<{ status: string }>(
          `select status from orders where id=$1`,
          [orderId],
        )
      ).rows[0].status,
      "confirmed",
    );
    await sql.query(
      `update production_tasks set stage='ready' where order_item_id=$1`,
      [itemId],
    );
    await createReadyDispatch(db, transport, orderId);
    const creates = calls.filter((c) => c.path === "/v1/order/create");
    assert.equal(creates.length, 3);
    assert.notEqual(creates[0].key, creates[2].key);
    const saved = (
      await sql.query<{ status_history: { postings: unknown[] } }>(
        `select status_history from order_shipments where order_id=$1`,
        [orderId],
      )
    ).rows[0];
    assert.equal(saved.status_history.postings.length, 2);
    await createReadyDispatch(db, transport, orderId);
    assert.equal(calls.filter((c) => c.path === "/v1/order/create").length, 3);
    const stale = await sql.query<{ apply_order_shipment_status: boolean }>(
      `select apply_order_shipment_status($1,'BOX-1','delivered',now(),$2,null)`,
      [orderId, JSON.stringify(shipment.status_history)],
    );
    assert.equal(stale.rows[0].apply_order_shipment_status, false);
    assert.equal(
      (
        await sql.query<{ status_history: { postings: unknown[] } }>(
          `select status_history from order_shipments where order_id=$1`,
          [orderId],
        )
      ).rows[0].status_history.postings.length,
      2,
    );
  } finally {
    await sql.close();
  }
});

test("address proxy requests only selected hierarchy and strips provider details", async () => {
  let body: Record<string, unknown> = {};
  const id = randomUUID();
  const suggestions = await suggestAddresses(
    { part: "house", query: "4", parent: { street_fias_id: id } },
    "private-key",
    async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        suggestions: [
          {
            value: "Москва, ул Яблочкова, д 49",
            data: {
              street_fias_id: id,
              house_fias_id: randomUUID(),
              flat: "not-used",
              geo_lat: "55",
            },
          },
          { value: "Улица без дома", data: { street_fias_id: id } },
        ],
      });
    },
  );
  assert.deepEqual(body.locations, [{ street_fias_id: id }]);
  assert.deepEqual(body.to_bound, { value: "house" });
  assert.equal(suggestions.length, 1);
  assert.deepEqual(Object.keys(suggestions[0]), ["value", "location"]);
  assert.deepEqual(
    await suggestAddresses({ part: "house", query: "454" }, "key", async () => {
      throw Error("must not call");
    }),
    [],
  );
  await assert.rejects(
    suggestAddresses(
      { part: "city", query: "мос" },
      "key",
      async () => new Response(null, { status: 403 }),
    ),
    /UNAVAILABLE/,
  );
});

test("packaging is charged for every physical parcel, including four plates and split batches", () => {
  const two: PackingRule = {
    ...rule,
    id: randomUUID(),
    composition: [{ category_id: "plates", quantity: 2 }],
  };
  const plan = packingForParcels(
    [{ ...stock, quantity: 4 }],
    [rule, two],
    "plates",
  );
  assert.equal(plan.parcels?.length, 2);
  assert.equal(packagingFeeFor(plan), 500);
  const split = splitDispatchPacking(
    [{ ...stock, quantity: 3 }, preorder],
    [rule, two],
    "plates",
  );
  assert.equal(split.parcels?.length, 3);
  assert.equal(packagingFeeFor(split), 750);
  assert.equal(packagingFeeFor(rule), 250);
  assert.throws(() => packagingFeeFor({ ...rule, parcels: [] }), /количество/);
});
