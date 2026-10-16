// No network integrations. Every fixture rolls back; invoice sequences only advance.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pool, guardTarget, directory } from "./common";
import selection from "../../database/migration-selection.json";
const db = pool("TARGET_DATABASE_URL");
let begun = false;
try {
  await guardTarget(db, false);
  const dir = await directory(process.argv[2]);
  if (
    process.env.APP_ENV !== "migration" ||
    process.env.JOBS_ENABLED === "true" ||
    process.env.CUSTOMER_EMAILS_ENABLED === "true"
  )
    throw Error("ISOLATED_IDLE_TARGET_REQUIRED");
  if (
    (
      await db.query(
        "select exists(select 1 from payments where mode='live') present",
      )
    ).rows[0].present
  )
    throw Error("LIVE_DATA_PRESENT");
  await db.query("BEGIN");
  begun = true;
  const session = randomUUID(),
    key = randomUUID(),
    product = selection.products[0].id;
  const stock = (
    await db.query(
      "select stock_qty,price from products where id=$1 for update",
      [product],
    )
  ).rows[0];
  await db.query("select record_funnel_event($1,'page_view','/catalog')", [
    session,
  ]);
  await db.query("select mutate_cart($1,$2,1,'add','stock')", [
    session,
    product,
  ]);
  await db.query(
    "select record_funnel_event($1,'add_to_cart','migration-proof')",
    [session],
  );
  await db.query(
    "select record_funnel_event($1,'checkout_started','/checkout')",
    [session],
  );
  const args = [
    session,
    key,
    {
      name: "Проверка отката транзакции",
      phone: "+70000000000",
      email: "migration@example.invalid",
      deliveryType: "pickup",
    },
    stock.price,
  ];
  const order = (
    await db.query("select checkout_order($1,$2,$3,$4) result", args)
  ).rows[0].result;
  assert.equal(
    (await db.query("select checkout_order($1,$2,$3,$4) result", args)).rows[0]
      .result.id,
    order.id,
  );
  assert.equal(
    (await db.query("select stock_qty from products where id=$1", [product]))
      .rows[0].stock_qty,
    stock.stock_qty - 1,
  );
  const pay = (
    await db.query(
      "insert into payments(order_id,mode,amount,cart_session,email,items) values($1,'live',$2,$3,'migration@example.invalid','[]') returning id,inv_id,amount",
      [order.id, stock.price, session],
    )
  ).rows[0];
  await db.query(
    "update orders set payment_provider='robokassa',payment_id=$2 where id=$1",
    [order.id, String(pay.inv_id)],
  );
  await db.query("select confirm_robokassa($1,$2,$3,'live')", [
    pay.id,
    pay.inv_id,
    pay.amount,
  ]);
  await db.query("select confirm_robokassa($1,$2,$3,'live')", [
    pay.id,
    pay.inv_id,
    pay.amount,
  ]);
  const events = (
    await db.query(
      "select kind,count(*)::int n from funnel_events where session_id=md5($1) group by kind",
      [session],
    )
  ).rows;
  assert.deepEqual(Object.fromEntries(events.map((x) => [x.kind, x.n])), {
    page_view: 1,
    add_to_cart: 1,
    checkout_started: 1,
    order_created: 1,
    paid: 1,
  });
  const notices = (
    await db.query(
      "select event,count(*)::int n from notification_outbox where order_id=$1 group by event",
      [order.id],
    )
  ).rows;
  assert.deepEqual(Object.fromEntries(notices.map((x) => [x.event, x.n])), {
    created: 1,
    paid: 1,
  });
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from order_events where order_id=$1 and kind='payment'",
        [order.id],
      )
    ).rows[0].n,
    1,
  );
  await db.query("ROLLBACK");
  begun = false;
  assert.equal(
    (await db.query("select stock_qty from products where id=$1", [product]))
      .rows[0].stock_qty,
    stock.stock_qty,
  );
  assert.equal(
    (
      await db.query(
        "select exists(select 1 from orders where id=$1) present",
        [order.id],
      )
    ).rows[0].present,
    false,
  );
  const proof = {
    verifiedAt: new Date().toISOString(),
    targetPostgres: true,
    externalCalls: false,
    rolledBack: true,
    checkoutIdempotent: true,
    paymentIdempotent: true,
    stockRestored: true,
    studioEventsUnique: true,
    funnel: [
      "page_view",
      "add_to_cart",
      "checkout_started",
      "order_created",
      "paid",
    ],
  };
  await writeFile(
    path.join(dir, "target-business-verified.json"),
    JSON.stringify(proof),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(proof));
} catch (error) {
  if (begun) await db.query("ROLLBACK");
  const failure = error as Error & { code?: string };
  console.error(
    "TARGET_BUSINESS_VERIFICATION_FAILED",
    failure.code ?? failure.name,
    failure.code === "42501" ? failure.message : "details suppressed",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
