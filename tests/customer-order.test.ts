import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { customerOrderState } from "../lib/customer-order-model";
import {
  postingInfoSchema,
  postingHistorySchema,
} from "../lib/delivery/posting-status";

test("customer states distinguish pickup, receipt, preorders and late payment", () => {
  const paid = { status: "confirmed", payment_status: "paid" };
  assert.equal(
    customerOrderState({ ...paid, delivery_stage: "ready_for_pickup" }).step,
    4,
  );
  assert.equal(
    customerOrderState({ ...paid, delivery_stage: "delivered" }).step,
    5,
  );
  assert.match(
    customerOrderState({ ...paid, hasPreorder: true, leadTimeDays: 21 }).detail,
    /21/,
  );
  assert.doesNotMatch(
    customerOrderState({ ...paid, hasPreorder: true }).detail,
    /1–3/,
  );
  assert.equal(customerOrderState({ ...paid, status: "cancelled" }).step, -1);
  assert.match(
    customerOrderState({ ...paid, status: "cancelled" }).detail,
    /возврат/,
  );
  assert.equal(
    customerOrderState({ status: "new", payment_status: "pending" }).step,
    0,
  );
  assert.throws(() =>
    postingInfoSchema.parse({
      postings: [{ posting_number: "X", status: "on_way" }],
    }),
  );
  assert.equal(
    postingHistorySchema.parse({
      history: [
        { status: "on_way", status_changed_at: "2026-10-10T00:00:00Z" },
      ],
    }).history.length,
    1,
  );
});

test("private order links rotate atomically; shipment status is trusted, ordered and idempotent", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create type public.order_status as enum('new','confirmed','in_production','shipped','delivered','cancelled');
   create table public.orders(id uuid primary key,status public.order_status not null,payment_status text not null,tracking_number text,reservation_state text);
   create table public.order_events(id uuid default gen_random_uuid(),order_id uuid references public.orders,kind text check(kind in ('status','payment','notes')),old_value text,new_value text,reason text);
   create table public.order_shipments(order_id uuid primary key references public.orders,state text,posting_number text,carrier_status text,status_history jsonb,last_error text,updated_at timestamptz default now());
   grant usage on schema public to service_role,anon,authenticated; grant all on all tables in schema public to service_role;
  `);
    for (const file of [
      "20261011182937_customer_order_access.sql",
      "20261011183647_shipment_status_sync.sql",
    ])
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    const id = randomUUID(),
      other = randomUUID();
    await db.query(
      "insert into orders(id,status,payment_status,reservation_state) values($1,'confirmed','paid','active'),($2,'cancelled','paid','released')",
      [id, other],
    );
    await db.query(
      "insert into order_shipments(order_id,state,posting_number) values($1,'created','POST-1'),($2,'created','POST-2')",
      [id, other],
    );
    const link = async (token: string, rotate = false) =>
      (
        await db.query<{ token: string }>(
          "select public.ensure_order_access($1,$2,$3) as token",
          [id, token, rotate],
        )
      ).rows[0].token;
    assert.equal(await link("a".repeat(64)), "a".repeat(64));
    assert.equal(await link("b".repeat(64)), "a".repeat(64));
    assert.equal(await link("b".repeat(64), true), "b".repeat(64));
    assert.equal(
      (
        await db.query("select * from order_access where token=$1", [
          "a".repeat(64),
        ])
      ).rows.length,
      0,
    );
    await db.exec("set role anon");
    await assert.rejects(
      () => db.query("select * from order_access"),
      /permission denied/,
    );
    await assert.rejects(() => link("c".repeat(64)), /permission denied/);
    await assert.rejects(
      () => db.query("select claim_order_shipment_sync()"),
      /permission denied/,
    );
    await db.exec("reset role; set role service_role");
    const claims = (
      await db.query<{ order_id: string; sync_claim: string }>(
        "select * from claim_order_shipment_sync(20)",
      )
    ).rows;
    assert.equal(claims.length, 1);
    assert.equal(claims[0].order_id, id);
    assert.equal(
      (await db.query("select * from claim_order_shipment_sync(20)")).rows
        .length,
      0,
    );
    const apply = async (
      status: string,
      date: string,
      claim: string | null = null,
      order = id,
      posting = "POST-1",
    ) =>
      (
        await db.query<{ updated: boolean }>(
          "select apply_order_shipment_status($1,$2,$3,$4,'{}'::jsonb,$5) as updated",
          [order, posting, status, date, claim],
        )
      ).rows[0].updated;
    assert.equal(
      await apply("on_way", "2026-10-10T12:00:00Z", randomUUID()),
      false,
    );
    assert.equal(
      await apply("on_way", "2026-10-10T12:00:00Z", claims[0].sync_claim),
      true,
    );
    let row = (
      await db.query<{
        status: string;
        delivery_stage: string;
        tracking_number: string;
        reservation_state: string;
      }>("select * from orders where id=$1", [id])
    ).rows[0];
    assert.equal(row.status, "shipped");
    assert.equal(row.tracking_number, "POST-1");
    assert.equal(row.reservation_state, "fulfilled");
    assert.equal(
      await apply("in_delivery_point", "2026-10-10T13:00:00Z"),
      true,
    );
    row = (await db.query<typeof row>("select * from orders where id=$1", [id]))
      .rows[0];
    assert.equal(row.status, "shipped");
    assert.equal(row.delivery_stage, "ready_for_pickup");
    assert.equal(await apply("on_way", "2026-10-10T12:00:00Z"), false);
    const events = await db.query(
      "select * from order_events where order_id=$1",
      [id],
    );
    await apply("in_delivery_point", "2026-10-10T13:00:00Z");
    assert.equal(
      (await db.query("select * from order_events where order_id=$1", [id]))
        .rows.length,
      events.rows.length,
    );
    await apply("new_unknown_status", "2026-10-10T14:00:00Z");
    assert.equal(
      (await db.query<typeof row>("select * from orders where id=$1", [id]))
        .rows[0].delivery_stage,
      "ready_for_pickup",
    );
    assert.equal(await apply("delivered", "2026-10-10T15:00:00Z"), true);
    assert.equal(
      (await db.query<typeof row>("select * from orders where id=$1", [id]))
        .rows[0].status,
      "delivered",
    );
    assert.equal(
      (await db.query("select * from claim_order_shipment_sync(20)")).rows
        .length,
      0,
    );
    assert.equal(
      await apply("delivered", "2026-10-10T15:00:00Z", null, other, "POST-2"),
      false,
    );
    assert.equal(
      (await db.query<typeof row>("select * from orders where id=$1", [other]))
        .rows[0].status,
      "cancelled",
    );
    await assert.rejects(
      () => apply("on_way", "2026-10-10T16:00:00Z", null, id, "OTHER"),
      /SHIPMENT_MISMATCH/,
    );
  } finally {
    await db.close();
  }
});
