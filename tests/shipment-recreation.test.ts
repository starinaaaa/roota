import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { recreatePaidShipment } from "../lib/delivery/recreate-shipment";
import {
  ceramicCategoryName,
  shipmentDescription,
} from "../lib/delivery/shipment-description";
import { carrierStatusLabel } from "../lib/delivery/parcel-status";

test("category names use singular ceramic forms and the correct grammatical gender", () => {
  for (const [slug, name, expected] of [
    ["plates", "Тарелки", "Тарелка керамическая"],
    ["stakany", "Стаканы", "Стакан керамический"],
    ["vases", "Вазы", "Ваза керамическая"],
    ["custom-slug", "Стаканы", "Стакан керамический"],
    ["bowls", "Миски", "Миска керамическая"],
  ])
    assert.equal(ceramicCategoryName({ slug, name }), expected);
  assert.equal(
    ceramicCategoryName({ slug: "unknown", name: "Другое" }),
    "Керамическое изделие",
  );
  assert.equal(
    shipmentDescription([
      {
        product_name: "Тарелка керамическая «Невидимка»",
        quantity: 1,
        category: { slug: "plates" },
      },
      { product_name: "Туман", quantity: 2, category: { slug: "stakany" } },
      { product_name: "Луна", quantity: 1, category: { name: "Вазы" } },
    ]),
    "Тарелка керамическая «Невидимка» × 1; Стакан керамический «Туман» × 2; Ваза керамическая «Луна» × 1",
  );
  assert.equal(carrierStatusLabel("canceled"), "Отменено");
});

async function fixture(count: number, active = false) {
  const sql = new PGlite();
  await sql.exec(`create table orders(id text primary key,order_number text,customer_phone text,customer_name text,payment_status text,status text,delivery_details jsonb,total_amount numeric,delivery_amount numeric,insurance_amount numeric,tracking_number text,delivery_stage text,reservation_state text);
  create table order_shipments(order_id text primary key,state text,order_number text,posting_number text,carrier_status text,idempotency_key uuid,request_payload jsonb,status_history jsonb,claimed_at timestamptz,carrier_changed_at timestamptz,synced_at timestamptz,sync_claim uuid,next_sync_at timestamptz,last_error text,updated_at timestamptz);
  create table categories(id text primary key,name text,slug text);create table products(id text primary key,category_id text);
  create table order_items(order_id text,product_id text,quantity int,price numeric,purchase_mode text,product_name text);
  create table delivery_packing_rules(id text,name text,composition jsonb,weight_g int,length_mm int,width_mm int,height_mm int,active boolean,updated_at timestamptz);
  create table order_events(order_id text,kind text,reason text);
  insert into categories values('plates','Тарелки','plates');insert into products values('product','plates');
  insert into delivery_packing_rules values('one','Одна','[{"category_id":"plates","quantity":1}]',600,250,250,60,true,now()),('two','Две','[{"category_id":"plates","quantity":2}]',1000,250,250,60,true,now());`);
  const details = {
    provider: "ozon",
    point: { id: 7 },
    shipment_method_id: 1,
    packing: { weight_g: 1900, delivery_packaging_fee: 250 },
  };
  await sql.query(
    "insert into orders values('order','GL-TEST','+79991234567','Test','paid',$1,$2,$3,364,36,'old-1','cancelled','active')",
    [count === 1 ? "new" : "confirmed", details, count * 6000 + 400],
  );
  await sql.query(
    "insert into order_items values('order','product',$1,6000,'stock','Невидимка')",
    [count],
  );
  const oldNumbers = Array.from(
    { length: Math.ceil(count / 2) },
    (_, i) => `old-${i + 1}`,
  );
  await sql.query(
    "insert into order_shipments(order_id,state,posting_number,idempotency_key,status_history) values('order','created','old-1','00000000-0000-4000-8000-000000000001',$1)",
    [
      {
        postings: oldNumbers.map((posting_number, i) => ({
          posting_number,
          request_id: i + 1,
        })),
      },
    ],
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
  const statuses = new Map(
    oldNumbers.map((number) => [number, active ? "created" : "canceled"]),
  );
  const calls: { path: string; body: unknown; key?: string }[] = [];
  let failNextCreate = false,
    cancelFailure = false;
  const creations = new Map<string, { body: unknown; response: unknown }>();
  const transport = {
    call: async <T>(path: string, body: unknown, key?: string): Promise<T> => {
      calls.push({ path, body: structuredClone(body), key });
      const input = body as {
        posting_numbers: string[];
        posting_number: string;
        postings: { request_id: number }[];
      };
      if (path === "/v1/posting/info")
        return {
          postings: input.posting_numbers.map((posting_number) => ({
            posting_number,
            status: statuses.get(posting_number),
            status_changed_at: "2026-10-23T00:00:00Z",
          })),
        } as T;
      if (path === "/v1/order/checkout")
        return {
          results: input.postings.map((p) => ({
            request_id: p.request_id,
            posting: {
              estimated_delivery_cost: {
                amount: "114.00",
                currency_code: "RUB",
              },
              estimated_insurance_cost: {
                amount: "36.00",
                currency_code: "RUB",
              },
              estimated_delivery_days: 5,
            },
          })),
        } as T;
      if (path === "/v1/posting/cancel") {
        if (cancelFailure) throw new Error("cancel interrupted");
        statuses.set(input.posting_number, "canceled");
        return {} as T;
      }
      if (path === "/v1/order/create") {
        assert.ok([...statuses.values()].every((s) => s === "canceled"));
        assert.ok(key);
        const previous = creations.get(key!);
        if (previous) {
          assert.deepEqual(body, previous.body);
          return previous.response as T;
        }
        const response = {
          order_number: "carrier-order",
          postings: input.postings.map((p) => ({
            request_id: p.request_id,
            posting_number: `new-${p.request_id}`,
          })),
        };
        creations.set(key!, { body: structuredClone(body), response });
        if (failNextCreate) {
          failNextCreate = false;
          throw new Error("response lost");
        }
        return response as T;
      }
      throw new Error(`unexpected ${path}`);
    },
  };
  return {
    sql,
    db,
    transport,
    calls,
    creations,
    statuses,
    setFailCreate: () => {
      failNextCreate = true;
    },
    setCancelFailure: (value: boolean) => {
      cancelFailure = value;
    },
  };
}
test("a canceled legacy one-plate shipment is recreated at 600g without changing payment, purchase or packaging fee", async () => {
  const f = await fixture(1);
  try {
    const preview = await recreatePaidShipment({
      db: f.db,
      transport: f.transport,
      orderId: "order",
      expectedPosting: "old-1",
    });
    assert.equal("preview" in preview && preview.preview, true);
    assert.equal(
      f.calls.filter((c) => c.path === "/v1/order/create").length,
      0,
    );
    const result = await recreatePaidShipment({
      db: f.db,
      transport: f.transport,
      orderId: "order",
      expectedPosting: "old-1",
      apply: true,
    });
    assert.equal("replaced" in result && result.replaced, true);
    const body = f.calls.find((c) => c.path === "/v1/order/create")!.body as {
      order_external_id: string;
      postings: {
        description: string;
        dimensions: { weight_g: number };
        declared_value: { amount: string };
      }[];
    };
    assert.equal(body.order_external_id, "GL-TEST");
    assert.equal(
      body.postings[0].description,
      "Тарелка керамическая «Невидимка» × 1",
    );
    assert.equal(body.postings[0].dimensions.weight_g, 600);
    assert.equal(body.postings[0].declared_value.amount, "6000.00");
    const order = (
      await f.sql.query<{
        status: string;
        payment_status: string;
        total_amount: string;
        delivery_stage: string;
        delivery_details: { packing: { delivery_packaging_fee: number } };
      }>("select * from orders")
    ).rows[0];
    assert.equal(order.status, "new");
    assert.equal(order.payment_status, "paid");
    assert.equal(Number(order.total_amount), 6400);
    assert.equal(order.delivery_stage, "preparing");
    assert.equal(order.delivery_details.packing.delivery_packaging_fee, 250);
  } finally {
    await f.sql.close();
  }
});
test("all old parcels are canceled before a fresh two-parcel shipment, and replay does not create duplicates", async () => {
  const f = await fixture(4, true);
  try {
    await assert.rejects(
      recreatePaidShipment({
        db: f.db,
        transport: f.transport,
        orderId: "order",
        expectedPosting: "old-1",
        apply: true,
      }),
      /Сначала отмените/,
    );
    f.setFailCreate();
    await assert.rejects(
      recreatePaidShipment({
        db: f.db,
        transport: f.transport,
        orderId: "order",
        expectedPosting: "old-1",
        apply: true,
        allowActive: true,
      }),
      /response lost/,
    );
    const first = f.calls.find((c) => c.path === "/v1/order/create")!;
    await recreatePaidShipment({
      db: f.db,
      transport: f.transport,
      orderId: "order",
      expectedPosting: "old-1",
      apply: true,
      allowActive: true,
    });
    const createCalls = f.calls.filter((c) => c.path === "/v1/order/create");
    assert.equal(createCalls.length, 2);
    assert.equal(createCalls[1].key, first.key);
    assert.deepEqual(createCalls[1].body, first.body);
    assert.equal(f.creations.size, 1);
    const again = await recreatePaidShipment({
      db: f.db,
      transport: f.transport,
      orderId: "order",
      expectedPosting: "old-1",
      apply: true,
      allowActive: true,
    });
    assert.equal(again.alreadyReplaced, true);
    assert.equal(f.creations.size, 1);
    const body = first.body as {
      postings: {
        dimensions: { weight_g: number };
        declared_value: { amount: string };
      }[];
    };
    assert.deepEqual(
      body.postings.map((p) => p.declared_value.amount),
      ["12000.00", "12000.00"],
    );
    assert.ok(body.postings.every((p) => p.dimensions.weight_g === 1000));
  } finally {
    await f.sql.close();
  }
});
test("a cancellation failure cannot create a new parcel; the frozen operation resumes safely", async () => {
  const f = await fixture(4, true);
  try {
    f.setCancelFailure(true);
    await assert.rejects(
      recreatePaidShipment({
        db: f.db,
        transport: f.transport,
        orderId: "order",
        expectedPosting: "old-1",
        apply: true,
        allowActive: true,
      }),
      /cancel interrupted/,
    );
    assert.equal(f.creations.size, 0);
    f.setCancelFailure(false);
    await recreatePaidShipment({
      db: f.db,
      transport: f.transport,
      orderId: "order",
      expectedPosting: "old-1",
      apply: true,
      allowActive: true,
    });
    assert.equal(f.creations.size, 1);
  } finally {
    await f.sql.close();
  }
});
