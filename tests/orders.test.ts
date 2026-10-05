import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { checkoutSchema } from "../lib/validation";

test("migration, checkout rollback, idempotency, stock and cancellation", async () => {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  const schema = (await readFile("supabase/schema.sql", "utf8")).replace(
    "create extension if not exists pgcrypto;",
    "",
  );
  await db.exec(schema);
  await db.exec(
    await readFile("tests/fixtures/production-additions.sql", "utf8"),
  );
  await db.exec(
    "grant usage on schema public to anon,authenticated,service_role; grant all on all tables in schema public to service_role; grant select on products,product_images,categories,products_with_primary_image to anon,authenticated;",
  );
  await db.exec(
    await readFile("supabase/migrations/202610050001_admin.sql", "utf8"),
  );
  const product = randomUUID(),
    category = randomUUID(),
    sessionA = randomUUID(),
    sessionB = randomUUID(),
    actor = randomUUID();
  const form = {
    name: "Тест",
    phone: "+79990000000",
    email: "test@example.invalid",
    deliveryType: "russia",
    address: "Тестовый адрес",
    comment: "",
  };
  const call = (session: string, key: string, amount = 100) =>
    db.query<{ result: { id: string; number: string } }>(
      "select checkout_order($1,$2,$3,$4) result",
      [session, key, form, amount],
    );
  await db.query("insert into categories(id,slug,name) values($1,$2,$3)", [
    category,
    "test",
    "Тест",
  ]);
  await db.query(
    "insert into products(id,category_id,slug,name,description,price,stock_qty,publication_status) values($1,$2,'test','Изделие','Описание',100,1,'published')",
    [product, category],
  );
  for (const session of [sessionA, sessionB]) {
    const cart = randomUUID();
    await db.query("insert into carts(id,session_id) values($1,$2)", [
      cart,
      session,
    ]);
    await db.query("insert into cart_items(cart_id,product_id) values($1,$2)", [
      cart,
      product,
    ]);
  }
  assert.equal(
    checkoutSchema.safeParse({ ...form, phone: "nope" }).success,
    false,
  );
  await assert.rejects(call(sessionA, randomUUID(), 1), /PRICE_CHANGED/);
  assert.equal(
    (await db.query<{ n: number }>("select count(*)::int n from orders"))
      .rows[0].n,
    0,
  );
  // A late failure must roll back customer, order, inventory and cart changes.
  await db.exec(
    "create function fail_item() returns trigger language plpgsql as $$ begin raise exception 'INJECTED_FAILURE'; end $$; create trigger fail_item before insert on order_items for each row execute function fail_item();",
  );
  await assert.rejects(call(sessionA, randomUUID()), /INJECTED_FAILURE/);
  assert.equal(
    (await db.query<{ n: number }>("select count(*)::int n from orders"))
      .rows[0].n,
    0,
  );
  await db.exec(
    "drop trigger fail_item on order_items; drop function fail_item();",
  );
  const key = randomUUID(),
    a = (await call(sessionA, key)).rows[0].result;
  assert.equal((await call(sessionA, key)).rows[0].result.id, a.id);
  await assert.rejects(call(sessionB, randomUUID()), /OUT_OF_STOCK/);
  assert.equal(
    (await db.query<{ n: number }>("select stock_qty n from products")).rows[0]
      .n,
    0,
  );
  await db.query(
    "update products set name='Другое название',price=200 where id=$1",
    [product],
  );
  const snapshot = (
    await db.query<{ price: number; product_name: string }>(
      "select price,product_name from order_items where order_id=$1",
      [a.id],
    )
  ).rows[0];
  assert.deepEqual(snapshot, { price: 100, product_name: "Изделие" });
  const cancel = () =>
    db.query("select change_order($1,'cancelled','pending','','','',$2)", [
      a.id,
      actor,
    ]);
  await cancel();
  await cancel();
  assert.equal(
    (await db.query<{ n: number }>("select stock_qty n from products")).rows[0]
      .n,
    1,
  );
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from order_events where kind='status' and new_value='cancelled'",
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    db.query("select change_order($1,'cancelled','paid','','','',$2)", [
      a.id,
      actor,
    ]),
    /PAYMENT_REASON_REQUIRED/,
  );
  await db.exec("set role anon;");
  await assert.rejects(db.query("select * from orders"), /permission denied/);
  await assert.rejects(call(sessionA, key), /permission denied/);
  await db.exec("reset role;");
  await db.close();
});
