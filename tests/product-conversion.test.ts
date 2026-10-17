import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const migration =
  "database/migrations/20261017_product_conversion.sql";
type Report = {
  totals: {
    views: number;
    carts: number;
    payments: number;
    paid_orders: number;
    units: number;
  };
  sources: { source: string; views: number; carts: number; payments: number }[];
};
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role roota_app bypassrls;
    create table products(id uuid primary key, slug text unique);
    create table orders(id uuid primary key, total_amount numeric default 100, cart_session text, payment_status text default 'paid');
    create table order_items(order_id uuid references orders, product_id uuid references products, quantity integer);
    create table payments(id uuid default gen_random_uuid(), order_id uuid references orders, mode text, status text, amount numeric, cart_session text);
    create table order_events(id uuid default gen_random_uuid(),order_id uuid,kind text,new_value text,reason text,actor_id uuid);
    create table email_blocks(email text primary key,reason text);
    grant usage on schema public to service_role, roota_app; grant all on all tables in schema public to service_role, roota_app;`);
  await db.exec(
    await readFile(
      "supabase/migrations/20261015105811_studio_returns_funnel.sql",
      "utf8",
    ),
  );
  const plate = randomUUID(),
    cup = randomUUID();
  await db.query("insert into products values($1,'plate'),($2,'cup')", [
    plate,
    cup,
  ]);
  const event = async (
    session: string,
    kind: string,
    detail: string,
    age = "0 days",
  ) => {
    await db.query(
      "select record_funnel_event($1,$2,$3,'telegram','social','autumn')",
      [session, kind, detail],
    );
    await db.query(
      "update funnel_events set created_at=now()-$4::interval where session_id=md5($1) and kind=$2 and detail=$3",
      [session, kind, detail, age],
    );
  };
  const sale = async (
    session: string,
    items: [string, number][],
    age = "0 days",
    mode = "live",
  ) => {
    const order = randomUUID();
    await db.query("insert into orders(id,cart_session) values($1,$2)", [
      order,
      session,
    ]);
    for (const [product, quantity] of items)
      await db.query("insert into order_items values($1,$2,$3)", [
        order,
        product,
        quantity,
      ]);
    await db.query(
      "insert into payments(order_id,mode,status,amount,cart_session) values($1,$2,'pending',100,$3)",
      [order, mode, session],
    );
    await db.query("update payments set status='paid' where order_id=$1", [
      order,
    ]);
    await db.query("update payments set status='paid' where order_id=$1", [
      order,
    ]);
    await db.query(
      "update funnel_events set created_at=now()-$2::interval where order_id=$1",
      [order, age],
    );
    return order;
  };
  const report = async (product: string | null, days = 30) =>
    (
      await db.query<{ r: Report }>("select product_funnel_report($1,$2) r", [
        days,
        product,
      ])
    ).rows[0].r;
  return {
    db,
    plate,
    cup,
    event,
    sale,
    report,
    migrate: async () => db.exec(await readFile(migration, "utf8")),
  };
}

test("product cohorts include catalogue purchases and next-day payments, deduplicate browsers and match purchased products", async () => {
  const f = await fixture();
  try {
    // Existing events are preserved and linked by the migration.
    const catalogueBuyer = randomUUID();
    await f.event(catalogueBuyer, "page_view", "/catalog", "2 days");
    await f.event(catalogueBuyer, "add_to_cart", f.plate, "2 days");
    await f.migrate();
    await f.sale(catalogueBuyer, [[f.plate, 2]], "1 day");
    assert.deepEqual((await f.report(f.plate)).totals, {
      views: 0,
      carts: 1,
      payments: 1,
      paid_orders: 1,
      units: 2,
    });
    // Viewing two products and buying only one does not convert the other.
    const chooser = randomUUID();
    await f.event(chooser, "page_view", "/product/plate", "3 days");
    await f.event(chooser, "page_view", "/product/cup", "3 days");
    await f.event(chooser, "add_to_cart", f.plate, "2 days");
    await f.event(chooser, "add_to_cart", f.cup, "2 days");
    await f.sale(chooser, [[f.plate, 1]], "1 day");
    await f.event(chooser, "page_view", "/product/plate");
    // Someone following a shared link is a different browser.
    await f.event(randomUUID(), "page_view", "/product/plate");
    assert.deepEqual((await f.report(f.plate)).totals, {
      views: 2,
      carts: 2,
      payments: 2,
      paid_orders: 2,
      units: 3,
    });
    assert.deepEqual((await f.report(f.cup)).totals, {
      views: 1,
      carts: 1,
      payments: 0,
      paid_orders: 0,
      units: 0,
    });
    const all = await f.report(null);
    assert.deepEqual(all.totals, {
      views: 2,
      carts: 2,
      payments: 2,
      paid_orders: 2,
      units: 3,
    });
    assert.equal(all.sources[0].payments, 2);
    assert.equal(all.sources[0].source, "telegram");
    // A mixed basket is one order; units include each purchased product.
    const mixed = randomUUID();
    await f.event(mixed, "add_to_cart", f.plate, "1 day");
    await f.event(mixed, "add_to_cart", f.cup, "1 day");
    await f.sale(mixed, [
      [f.plate, 2],
      [f.cup, 3],
    ]);
    assert.deepEqual((await f.report(null)).totals, {
      views: 2,
      carts: 3,
      payments: 3,
      paid_orders: 3,
      units: 8,
    });
    // Stable ID keeps interest after a slug change, and future views still attach.
    await f.db.query("update products set slug='new-plate' where id=$1", [
      f.plate,
    ]);
    await f.event(chooser, "page_view", "/product/new-plate");
    assert.equal((await f.report(f.plate)).totals.views, 2);
    assert.deepEqual((await f.report(randomUUID())).totals, {
      views: 0,
      carts: 0,
      payments: 0,
      paid_orders: 0,
      units: 0,
    });
  } finally {
    await f.db.close();
  }
});

test("periods, sandbox payments, old orders and SQL permissions do not inflate conversion", async () => {
  const f = await fixture();
  try {
    await f.migrate();
    const old = randomUUID();
    await f.event(old, "add_to_cart", f.plate, "10 days");
    await f.sale(old, [[f.plate, 1]]);
    // Actual sales are by payment date, conversion is by the addition cohort.
    assert.deepEqual((await f.report(f.plate, 7)).totals, {
      views: 0,
      carts: 0,
      payments: 0,
      paid_orders: 1,
      units: 1,
    });
    assert.equal((await f.report(f.plate, 30)).totals.payments, 1);
    const sandbox = randomUUID();
    await f.event(sandbox, "add_to_cart", f.cup, "1 day");
    await f.sale(sandbox, [[f.cup, 1]], "0 days", "test");
    assert.equal((await f.report(f.cup)).totals.payments, 0);
    // An old order paid after a new addition must not convert that new addition.
    const late = randomUUID();
    const oid = await f.sale(late, [[f.cup, 1]], "3 days");
    await f.event(late, "add_to_cart", f.cup, "1 day");
    await f.db.query(
      "update funnel_events set created_at=now() where order_id=$1 and kind='paid'",
      [oid],
    );
    assert.equal((await f.report(f.cup)).totals.payments, 0);
    for (const role of ["anon", "authenticated"]) {
      await f.db.exec(`set role ${role}`);
      await assert.rejects(f.report(null), /permission denied/);
      await f.db.exec("reset role");
    }
    await f.db.exec("grant select on funnel_events,funnel_sessions to roota_app; set role roota_app");
    assert.equal((await f.report(f.plate)).totals.payments, 1);
  } finally {
    await f.db.close();
  }
});
