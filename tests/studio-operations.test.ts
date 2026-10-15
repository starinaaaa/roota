import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { refundItems, verifiedRefundState } from "../lib/payments/refunds";
import { analyticsInput, campaignValue } from "../lib/analytics/model";

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create table orders(id uuid primary key default gen_random_uuid(),total_amount numeric not null default 100,cart_session text,payment_status text default 'paid');
    create table payments(id uuid primary key default gen_random_uuid(),order_id uuid references orders,mode text,status text,amount numeric,cart_session text);
    create table order_events(id uuid default gen_random_uuid(),order_id uuid,kind text,new_value text,reason text,actor_id uuid);
    create table email_blocks(email text primary key,reason text);
    grant usage on schema public to service_role;grant all on all tables in schema public to service_role;`);
  await db.exec(
    await readFile(
      "supabase/migrations/20261015105811_studio_returns_funnel.sql",
      "utf8",
    ),
  );
  return db;
}
test("refund uses original fiscal amounts including delivery and verifies provider identity", () => {
  const receipt = {
    items: [
      { name: "Изделие", quantity: 2, sum: 80, tax: "none" as const },
      { name: "Доставка", quantity: 1, sum: 20, tax: "none" as const },
    ],
  };
  assert.equal(refundItems(receipt, "100.00")[0].Cost, 80);
  assert.throws(() => refundItems(receipt, "99"));
  assert.throws(() => refundItems(null, "100"));
  const id = randomUUID();
  assert.equal(
    verifiedRefundState(
      { requestId: id, amount: 100, label: "finished" },
      id,
      "100.00",
    ),
    "finished",
  );
  assert.throws(() =>
    verifiedRefundState(
      { requestId: randomUUID(), amount: 100, label: "finished" },
      id,
      "100",
    ),
  );
  assert.throws(() =>
    verifiedRefundState(
      { requestId: id, amount: 1, label: "finished" },
      id,
      "100",
    ),
  );
  assert.throws(() =>
    verifiedRefundState(
      { requestId: id, amount: 100, label: "unknown" },
      id,
      "100",
    ),
  );
});
test("analytics excludes personal URLs and limits UTM input", () => {
  for (const page of [
    "/order/secret",
    "/admin/orders",
    "/checkout?email=x@y.ru",
    "/cart/restore/secret",
  ])
    assert.equal(analyticsInput.safeParse({ page }).success, false);
  assert.equal(
    analyticsInput.safeParse({ page: "/product/cup", source: "campaign" })
      .success,
    true,
  );
  assert.equal(campaignValue("a@b.ru?token=123"), "ab.rutoken123");
  assert.equal(campaignValue("a".repeat(100)).length, 80);
});
test("refund claim excludes concurrent retries, sandbox and unpaid orders; completion is idempotent", async () => {
  const db = await database();
  try {
    const oid = randomUUID(),
      actor = randomUUID();
    await db.query("insert into orders(id) values($1)", [oid]);
    await db.query(
      "select save_order_return($1,'expected','Повреждённое изделие',$2)",
      [oid, actor],
    );
    await db.query(
      "insert into payments(order_id,mode,status,amount) values($1,'test','paid',100)",
      [oid],
    );
    await assert.rejects(
      db.query("select claim_order_refund($1,$2)", [oid, actor]),
      /PAYMENT_NOT_PAID/,
    );
    await db.query("update payments set mode='live' where order_id=$1", [oid]);
    await db.query("select claim_order_refund($1,$2)", [oid, actor]);
    await assert.rejects(
      db.query("select claim_order_refund($1,$2)", [oid, actor]),
      /REFUND_ALREADY_STARTED/,
    );
    await db.query("select set_order_refund_state($1,'unknown',null)", [oid]);
    await assert.rejects(
      db.query("select claim_order_refund($1,$2)", [oid, actor]),
      /REFUND_ALREADY_STARTED/,
    );
    const req = randomUUID();
    await db.query("select set_order_refund_state($1,'processing',$2)", [
      oid,
      req,
    ]);
    await assert.rejects(
      db.query("select set_order_refund_state($1,'finished',$2)", [
        oid,
        randomUUID(),
      ]),
      /REQUEST_MISMATCH/,
    );
    await db.query("select set_order_refund_state($1,'finished',$2)", [
      oid,
      req,
    ]);
    await db.query("select set_order_refund_state($1,'finished',$2)", [
      oid,
      req,
    ]);
    assert.equal(
      (
        await db.query<{ payment_status: string }>(
          "select payment_status from orders where id=$1",
          [oid],
        )
      ).rows[0].payment_status,
      "refunded",
    );
    assert.equal(
      (
        await db.query<{ goods_state: string }>(
          "select goods_state from order_returns where order_id=$1",
          [oid],
        )
      ).rows[0].goods_state,
      "expected",
    );
    await db.query(
      "select save_order_return($1,'received','Изделие получено',$2)",
      [oid, actor],
    );
    assert.equal(
      (
        await db.query<{ money_state: string }>(
          "select money_state from order_returns where order_id=$1",
          [oid],
        )
      ).rows[0].money_state,
      "finished",
    );
  } finally {
    await db.close();
  }
});
test("funnel deduplicates views and trusted callbacks, keeps first UTM and counts sequential sessions", async () => {
  const db = await database();
  try {
    const session = randomUUID(),
      oid = randomUUID();
    await db.query(
      "select record_funnel_event($1,'checkout_error','order_submission')",
      [session],
    );
    await db.query(
      "select record_funnel_event($1,'page_view','/','ads','cpc','autumn')",
      [session],
    );
    await db.query(
      "select record_funnel_event($1,'page_view','/','other','','')",
      [session],
    );
    await db.query("select record_funnel_event($1,'add_to_cart','cup')", [
      session,
    ]);
    await db.query(
      "select record_funnel_event($1,'checkout_started','/checkout')",
      [session],
    );
    await db.query("insert into orders(id,cart_session) values($1,$2)", [
      oid,
      session,
    ]);
    await db.query(
      "insert into payments(order_id,mode,status,amount,cart_session) values($1,'live','pending',100,$2)",
      [oid, session],
    );
    await db.query("update payments set status='paid' where order_id=$1", [
      oid,
    ]);
    await db.query("update payments set status='paid' where order_id=$1", [
      oid,
    ]);
    const other = randomUUID();
    await db.query("select record_funnel_event($1,'page_view','/')", [other]);
    // Skip cart: this session must not inflate later sequential stages.
    await db.query(
      "select record_funnel_event($1,'checkout_started','/checkout')",
      [other],
    );
    const report = (
      await db.query<{
        r: { totals: Record<string, number>; sources: { source: string }[] };
      }>("select funnel_report(30) r")
    ).rows[0].r;
    assert.deepEqual(report.totals, {
      views: 2,
      carts: 1,
      checkouts: 1,
      orders: 1,
      payments: 1,
    });
    assert.ok(report.sources.some((s) => s.source === "ads"));
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from funnel_events where kind='paid'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from funnel_sessions where id=$1",
          [session],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
test("marketing opt-out cannot downgrade a bounce or complaint; server tables and RPCs reject guests", async () => {
  const db = await database();
  try {
    await db.exec(
      "select block_email_recipient('studio@example.test','bounced');select block_email_recipient('studio@example.test','marketing_unsubscribed');",
    );
    assert.equal(
      (await db.query<{ reason: string }>("select reason from email_blocks"))
        .rows[0].reason,
      "bounced",
    );
    await db.exec(
      "select block_email_recipient('studio@example.test','complained');select block_email_recipient('studio@example.test','bounced');",
    );
    assert.equal(
      (await db.query<{ reason: string }>("select reason from email_blocks"))
        .rows[0].reason,
      "complained",
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from order_returns"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from funnel_events"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select funnel_report(30)"),
      /permission denied/,
    );
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});

test("cabinet refund reconciliation requires a paid matching order and cannot steal another request", async () => {
  const db = await database();
  try {
    const first = randomUUID(),
      second = randomUUID(),
      actor = randomUUID(),
      request = randomUUID();
    for (const id of [first, second]) {
      await db.query("insert into orders(id) values($1)", [id]);
      await db.query(
        "select save_order_return($1,'expected','Сверено в кабинете',$2)",
        [id, actor],
      );
      await db.query(
        "insert into payments(order_id,mode,status,amount) values($1,'live','paid',100)",
        [id],
      );
    }
    await db.query(
      "select attach_order_refund($1,$2,$3,'Сверены заказ и сумма')",
      [first, request, actor],
    );
    await assert.rejects(
      db.query("select attach_order_refund($1,$2,$3,'Сверены заказ и сумма')", [
        second,
        request,
        actor,
      ]),
      /unique/,
    );
    await db.query("update payments set amount=99 where order_id=$1", [second]);
    await assert.rejects(
      db.query("select attach_order_refund($1,$2,$3,'Сверены заказ и сумма')", [
        second,
        randomUUID(),
        actor,
      ]),
      /PAYMENT_NOT_PAID/,
    );
  } finally {
    await db.close();
  }
});
