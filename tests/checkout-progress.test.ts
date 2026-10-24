import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  saveCheckoutProgressSql,
  unfinishedCartsSql,
} from "../lib/analytics/checkout-queries";
import { checkoutProgressInput } from "../lib/analytics/checkout-progress";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role roota_app; create role anon;
    create table carts(id uuid primary key default gen_random_uuid(),session_id text unique,updated_at timestamptz default now()-interval '1 hour');
    create table checkout_contact_drafts(cart_id uuid primary key,data jsonb,updated_at timestamptz default now(),expires_at timestamptz default now()+interval '7 days');
    create table products(id uuid primary key default gen_random_uuid(),name text,price numeric);
    create table cart_items(cart_id uuid,product_id uuid,quantity integer,purchase_mode text default 'stock');
    create table orders(id uuid primary key default gen_random_uuid(),order_number text default 'TEST',cart_session text,payment_status text,created_at timestamptz default now());
    create table funnel_events(session_id text,kind text,created_at timestamptz default now());
    create table analytics_excluded_sessions(id text primary key);
    create table delivery_quotes(id uuid primary key,cart_session text,point jsonb,delivery_amount numeric,insurance_amount numeric);
    create table email_subscriptions(id uuid primary key default gen_random_uuid(),email text,purpose text default 'cart',resource text,revoked_at timestamptz,expires_at timestamptz default now()+interval '7 days',direct_consent_at timestamptz,confirmed_at timestamptz);
    create table checkout_drafts(session_id text,subscription_id uuid,completed_at timestamptz,expires_at timestamptz default now()+interval '7 days');
    create table email_messages(subscription_id uuid,kind text,state text,created_at timestamptz default now());
  `);
  await db.exec(
    await readFile(
      "database/migrations/20261023_checkout_progress.sql",
      "utf8",
    ),
  );
  const product = randomUUID();
  await db.query("insert into products values($1,'Невидимка',2000)", [product]);
  const cart = async () => {
    const session = randomUUID();
    const c = (
      await db.query<{ id: string }>(
        "insert into carts(session_id) values($1) returning id",
        [session],
      )
    ).rows[0];
    await db.query(
      "insert into cart_items(cart_id,product_id,quantity) values($1,$2,2)",
      [c.id, product],
    );
    return { session, id: c.id };
  };
  const save = (
    session: string,
    stage: string,
    method = "ozon_point",
    point: number | null = null,
    quote: string | null = null,
  ) =>
    db.query(saveCheckoutProgressSql, [session, stage, method, point, quote]);
  const list = (
    inactive = false,
    start: string | null = null,
    end: string | null = null,
  ) =>
    db.query<{
      stage: string;
      delivery_cost: string | null;
      point_id: number | null;
      email: string | null;
      reminder_state: string | null;
      order_id: string | null;
      checkout_contact: { firstName?: string; phone?: string } | null;
      goods_total: string;
      items: unknown[];
    }>(unfinishedCartsSql, [30, start, end, inactive, 0]);
  return { db, cart, save, list };
}

test("unfinished carts show anonymous visitors before submission, progress, server quote price and inactivity", async () => {
  const f = await fixture();
  try {
    const c = await f.cart();
    assert.equal((await f.list(true)).rows[0].stage, "cart");
    assert.equal((await f.list()).rows[0].email, null);
    assert.equal(Number((await f.list()).rows[0].goods_total), 4000);
    await f.save(c.session, "checkout_opened");
    assert.equal((await f.list()).rows[0].stage, "checkout_opened");
    assert.equal((await f.list(true)).rows.length, 0);
    await f.save(c.session, "point_selected", "ozon_point", 123);
    const quote = randomUUID();
    await f.db.query(
      "insert into delivery_quotes values($1,$2,'{\"id\":123}',450,20)",
      [quote, c.session],
    );
    await f.save(c.session, "delivery_quote_seen", "ozon_point", null, quote);
    let row = (await f.list()).rows[0];
    assert.equal(row.stage, "delivery_quote_seen");
    assert.equal(Number(row.delivery_cost), 470);
    assert.equal(Number(row.point_id), 123);
    // Reload does not erase the last meaningful step.
    await f.save(c.session, "checkout_opened");
    assert.equal((await f.list()).rows[0].stage, "delivery_quote_seen");
    await f.save(c.session, "validation_error");
    assert.equal(Number((await f.list()).rows[0].delivery_cost), 470);
    // Switching to courier removes the old pickup quote.
    await f.save(c.session, "delivery_started", "yandex_courier");
    row = (await f.list()).rows[0];
    assert.equal(row.delivery_cost, null);
    assert.equal(row.point_id, null);
    // An unrelated browser cannot attach another person's quote.
    const stranger = await f.cart();
    await f.save(
      stranger.session,
      "delivery_quote_seen",
      "ozon_point",
      null,
      quote,
    );
    assert.equal(
      (
        await f.db.query(
          "select 1 from analytics_checkout_progress where session_id=md5($1)",
          [stranger.session],
        )
      ).rows.length,
      0,
    );
    // A changed basket starts a new checkout, without stale delivery state.
    await f.db.query(
      "update carts set updated_at=now()+interval '1 second' where id=$1",
      [c.id],
    );
    await f.save(c.session, "checkout_opened");
    const progress = (
      await f.db.query<{ stage: string; delivery_cost: null }>(
        "select * from analytics_checkout_progress where session_id=md5($1)",
        [c.session],
      )
    ).rows[0];
    assert.equal(progress.stage, "checkout_opened");
    assert.equal(progress.delivery_cost, null);
  } finally {
    await f.db.close();
  }
});

test("paid, empty and excluded baskets disappear; consent controls contact visibility and reminders", async () => {
  const f = await fixture();
  try {
    const c = await f.cart();
    const sub = (
      await f.db.query<{ id: string }>(
        "insert into email_subscriptions(email,resource,direct_consent_at) values('buyer@example.test',$1,now()) returning id",
        [c.session],
      )
    ).rows[0].id;
    await f.db.query(
      "insert into checkout_drafts(session_id,subscription_id) values($1,$2)",
      [c.session, sub],
    );
    await f.db.query(
      "insert into email_messages(subscription_id,kind,state) values($1,'cart_reminder','pending')",
      [sub],
    );
    assert.equal((await f.list()).rows[0].email, "buyer@example.test");
    assert.equal((await f.list()).rows[0].reminder_state, "pending");
    await f.db.query(
      "update email_subscriptions set revoked_at=now() where id=$1",
      [sub],
    );
    assert.equal((await f.list()).rows[0].email, null);
    await f.db.query(
      "insert into orders(cart_session,payment_status) values($1,'pending')",
      [c.session],
    );
    assert.ok((await f.list()).rows[0].order_id);
    await f.db.query(
      "update orders set payment_status='paid' where cart_session=$1",
      [c.session],
    );
    assert.equal((await f.list()).rows.length, 0);
    const excluded = await f.cart();
    await f.db.query(
      "insert into analytics_excluded_sessions values(md5($1))",
      [excluded.session],
    );
    await f.save(excluded.session, "checkout_opened");
    assert.equal((await f.list()).rows.length, 0);
    assert.equal(
      (await f.db.query("select 1 from analytics_checkout_progress")).rows
        .length,
      0,
    );
    const empty = await f.cart();
    await f.db.query("delete from cart_items where cart_id=$1", [empty.id]);
    assert.equal((await f.list()).rows.length, 0);
    await f.db.exec("set role anon");
    await assert.rejects(
      f.db.query("select * from analytics_checkout_progress"),
      /permission denied/,
    );
  } finally {
    await f.db.close();
  }
});

test("progress accepts only bounded stage metadata and rejects typed personal data and client prices", () => {
  assert.equal(
    checkoutProgressInput.safeParse({
      stage: "delivery_quote_seen",
      method: "ozon_point",
      quote: randomUUID(),
    }).success,
    true,
  );
  for (const input of [
    { stage: "delivery_quote_seen", method: "ozon_point" },
    { stage: "point_selected", method: "ozon_point", point: -1 },
    {
      stage: "checkout_opened",
      method: "ozon_point",
      email: "buyer@example.test",
    },
    {
      stage: "delivery_quote_seen",
      method: "ozon_point",
      quote: randomUUID(),
      cost: 1,
    },
    { stage: "raw_error", method: "ozon_point" },
  ])
    assert.equal(checkoutProgressInput.safeParse(input).success, false);
});

test("saved partial contacts are visible without enrolling reminders and disappear after expiry", async () => {
  const f = await fixture();
  try {
    const c = await f.cart();
    await f.db.query(
      "insert into checkout_contact_drafts(cart_id,data) values($1,$2)",
      [
        c.id,
        JSON.stringify({
          firstName: "Анна",
          phone: "+7 99",
          deliveryMethod: "ozon_point",
        }),
      ],
    );
    const row = (await f.list()).rows[0];
    assert.equal(row.checkout_contact?.firstName, "Анна");
    assert.equal(row.checkout_contact?.phone, "+7 99");
    assert.equal(row.email, null);
    assert.equal((await f.list(true)).rows.length, 0);
    await f.db.exec(
      "update checkout_contact_drafts set expires_at=now()-interval '1 second'",
    );
    assert.equal((await f.list()).rows[0].checkout_contact, null);
  } finally {
    await f.db.close();
  }
});
