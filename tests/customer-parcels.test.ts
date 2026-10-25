import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  customerParcels,
  parcelProgress,
  deliveryEmailUpdate,
} from "../lib/delivery/customer-parcels";
import { customerOrderState } from "../lib/customer-order-model";
import { renderEmail } from "../lib/email/templates";

test("customer parcels preserve request ordering, frozen contents and independent progress", () => {
  const parcels = customerParcels(null, [], {
    state: "created",
    request_payload: {
      postings: [
        { request_id: 1, description: "Тарелка «<Луна>» × 2" },
        { request_id: 2, description: "Тарелка «Солнце» × 1" },
      ],
    },
    status_history: {
      postings: [
        { request_id: 2, posting_number: "SECOND", status: "on_way" },
        { request_id: 1, posting_number: "FIRST", status: "in_delivery_point" },
      ],
    },
  });
  assert.deepEqual(
    parcels.map((p) => p.number),
    ["FIRST", "SECOND"],
  );
  assert.match(parcelProgress(parcels), /Можно забрать: 1 из 2/);
  assert.match(
    deliveryEmailUpdate("order_pickup", "GL-TEST", parcels, "FIRST").subject,
    /Посылка 1 из 2/,
  );
  assert.match(
    customerOrderState({
      status: "shipped",
      payment_status: "paid",
      delivery_stage: "in_transit",
      parcelStatuses: parcels.map((p) => p.status),
    }).title,
    /Можно забрать 1 из 2/,
  );
  const email = renderEmail(
    { subject: "{{delivery_subject}}", body: "{{delivery_update}}" },
    {
      number: "GL-TEST",
      delivery_subject: "Посылка прибыла",
      delivery_update: "Заберите посылку",
    },
    "https://example.invalid/order/token",
    "Открыть заказ",
    undefined,
    true,
    [],
    parcels,
  );
  assert.match(email.html, /FIRST/);
  assert.match(email.html, /SECOND/);
  assert.match(email.html, /&lt;Луна&gt;/);
  assert.doesNotMatch(email.html, /<Луна>/);
  assert.match(email.plaintext, /Посылка 2 из 2/);
  assert.equal(
    customerParcels(null, [], {
      posting_number: "LEGACY",
      carrier_status: "on_way",
    })[0].status,
    "on_way",
  );
});

test("parcel milestones are transactional, deduplicated and receipt waits for every parcel", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/schema.sql", "utf8"));
    await db.exec(
      await readFile(
        "tests/fixtures/parcel-email-functions-before.sql",
        "utf8",
      ),
    );
    const migration = await readFile(
      "database/migrations/20261023_customer_parcel_updates.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(`insert into email_settings(id,enabled,test_mode) values(1,true,false);
 insert into email_templates(kind,subject,body) values('order_created','created','created'),('order_paid','paid','paid'),('order_shipped','shipped','shipped'),('order_pickup','pickup','pickup'),('order_delivered','delivered','delivered');`);
    const {
      rows: [order],
    } = await db.query<{ id: string }>(
      `insert into orders(customer_name,customer_phone,customer_email,total_amount,delivery_type,status,payment_status,delivery_stage,delivery_details) values('Test','Test','nobody@example.invalid',18000,'russia','confirmed','paid','preparing','{"provider":"ozon"}') returning id`,
    );
    const postings = (a: string, b: string) => ({
      postings: [
        { request_id: 1, posting_number: "FIRST", status: a },
        { request_id: 2, posting_number: "SECOND", status: b },
      ],
    });
    await db.query(
      `insert into order_shipments(order_id,state,posting_number,carrier_status,status_history) values($1,'created','FIRST','created',$2)`,
      [order.id, JSON.stringify(postings("created", "created"))],
    );
    await db.exec("delete from email_messages");
    const sync = async (a: string, b: string, combined: string) =>
      db.query(
        "select apply_order_shipment_status($1,'FIRST',$2,now(),$3,null)",
        [order.id, combined, JSON.stringify(postings(a, b))],
      );
    const messages = async () =>
      (
        await db.query<{
          kind: string;
          payload: { posting_number?: string };
          state: string;
        }>(
          "select kind,payload,state from email_messages order by created_at,id",
        )
      ).rows;
    await sync("on_way", "created", "created");
    await sync("on_way", "created", "created");
    assert.equal((await messages()).length, 1);
    assert.equal((await messages())[0].payload.posting_number, "FIRST");
    await sync("in_delivery_point", "on_way", "on_way");
    assert.equal((await messages()).length, 3);
    assert.equal(
      (await messages()).filter((m) => !m.payload.posting_number).length,
      0,
    );
    const claimed = (
      await db.query<{ kind: string; payload: { posting_number: string } }>(
        "select * from claim_email_messages(10)",
      )
    ).rows;
    assert.equal(claimed.length, 2);
    assert.ok(
      claimed.some(
        (m) =>
          m.kind === "order_pickup" && m.payload.posting_number === "FIRST",
      ),
    );
    assert.equal(
      (await messages()).find(
        (m) =>
          m.kind === "order_shipped" && m.payload.posting_number === "FIRST",
      )?.state,
      "cancelled",
    );
    await sync("delivered", "in_delivery_point", "in_delivery_point");
    assert.equal(
      (await messages()).filter((m) => m.kind === "order_delivered").length,
      0,
    );
    await sync("delivered", "delivered", "delivered");
    await sync("delivered", "delivered", "delivered");
    assert.equal(
      (await messages()).filter((m) => m.kind === "order_delivered").length,
      1,
    );
    // Current-generation guard cancels old pickup letters once the parcel has been received.
    await db.query("select * from claim_email_messages(10)");
    assert.equal(
      (await messages()).find(
        (m) =>
          m.kind === "order_pickup" && m.payload.posting_number === "SECOND",
      )?.state,
      "cancelled",
    );
    // A problem in the second box must not discard a valid pickup notice for the first.
    await db.query(
      "update orders set status='confirmed',delivery_stage='preparing' where id=$1",
      [order.id],
    );
    await db.query(
      "update order_shipments set carrier_status='created',status_history=$2 where order_id=$1",
      [order.id, JSON.stringify(postings("created", "created"))],
    );
    await db.exec("delete from email_messages");
    await sync("in_delivery_point", "created", "created");
    await sync("in_delivery_point", "canceled", "forming_failed");
    const healthy = (
      await db.query<{ payload: { posting_number: string } }>(
        "select * from claim_email_messages(10)",
      )
    ).rows;
    assert.equal(healthy.length, 1);
    assert.equal(healthy[0].payload.posting_number, "FIRST");
    // A replacement invalidates queued letters even when the new parcel is at the same milestone.
    await db.exec("update email_messages set state='pending',claim=null");
    await db.query(
      "update order_shipments set status_history=$2 where order_id=$1",
      [
        order.id,
        JSON.stringify({
          postings: [
            {
              request_id: 1,
              posting_number: "REPLACEMENT",
              status: "in_delivery_point",
            },
          ],
        }),
      ],
    );
    assert.equal(
      (await db.query("select * from claim_email_messages(10)")).rows.length,
      0,
    );
    assert.equal((await messages())[0].state, "cancelled");
  } finally {
    await db.close();
  }
});

test("garden parcels describe the constructor while preserving the original purchased composition", () => {
  const configuration = { size: 12, stems: 6, flowers: 3, leaves: 3 } as const;
  const parcels = customerParcels(null, [{ product_name: "Сад — Садовый дворик (стебли: 6, цветочки: 3, листочки: 3)", quantity: 1, configuration }], {
    request_payload: { postings: [{ request_id: 1, description: "Керамическое изделие «Сад» × 1" }] },
  });
  assert.equal(parcels[0].description, "Керамический конструктор «Сад» — Садовый дворик (стебли: 6, цветочки: 3, листочки: 3) × 1");
});
