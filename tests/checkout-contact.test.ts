import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  checkoutContactInput,
  hasCheckoutContact,
  saveCheckoutContactSql,
  type CheckoutContactData,
} from "../lib/checkout-contact";
const blank: CheckoutContactData = {
  firstName: "",
  lastName: "",
  phone: "+7",
  email: "",
  telegram: "",
  address: "",
  comment: "",
  deliveryMethod: "ozon_point",
  delivery: null,
};
test("drafts accept partially typed contacts, reject extra fields and don't require email", () => {
  assert.equal(hasCheckoutContact(blank), false);
  assert.equal(hasCheckoutContact({ ...blank, firstName: "А" }), true);
  assert.equal(
    checkoutContactInput.safeParse({
      capturedAt: Date.now(),
      data: { ...blank, phone: "+7 99", email: "part@" },
    }).success,
    true,
  );
  assert.equal(
    checkoutContactInput.safeParse({
      capturedAt: Date.now(),
      data: { ...blank, password: "secret" },
    }).success,
    false,
  );
  assert.equal(
    checkoutContactInput.safeParse({
      capturedAt: Date.now(),
      data: { ...blank, comment: "x".repeat(2001) },
    }).success,
    false,
  );
});
test("contact snapshots are isolated by cart, retain newest edits, clear fields and expire without enrolling emails", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role roota_app;create role anon;
 create table carts(id uuid primary key default gen_random_uuid(),session_id text unique,updated_at timestamptz default now());
 create table cart_items(cart_id uuid,quantity integer);
 create table orders(id uuid primary key default gen_random_uuid(),cart_session text,created_at timestamptz default now());
 create table email_messages(id uuid);create table email_subscriptions(id uuid);`);
    await db.exec(
      await readFile(
        "database/migrations/20261024_checkout_contact_drafts.sql",
        "utf8",
      ),
    );
    const session = randomUUID();
    const other = randomUUID();
    const {
      rows: [cart],
    } = await db.query<{ id: string }>(
      "insert into carts(session_id) values($1) returning id",
      [session],
    );
    await db.query("insert into cart_items values($1,1)", [cart.id]);
    const save = (who: string, data: CheckoutContactData, time: number) =>
      db.query(saveCheckoutContactSql, [
        who,
        JSON.stringify(data),
        time,
        hasCheckoutContact(data),
      ]);
    const rows = async () =>
      (
        await db.query<{ data: CheckoutContactData }>(
          "select data from checkout_contact_drafts",
        )
      ).rows;
    const now = Date.now();
    await save(session, blank, now);
    assert.equal((await rows()).length, 0);
    await save(session, { ...blank, firstName: "А", phone: "+7 99" }, now + 1);
    assert.equal((await rows())[0].data.phone, "+7 99");
    await save(other, { ...blank, firstName: "Другой" }, now + 2);
    assert.equal((await rows()).length, 1);
    await save(session, { ...blank, firstName: "Анна" }, now + 3);
    await save(session, { ...blank, firstName: "Устаревшее" }, now + 2);
    assert.equal((await rows())[0].data.firstName, "Анна");
    await save(session, blank, now + 4);
    await save(session, { ...blank, email: "old@example.invalid" }, now + 3);
    assert.equal((await rows())[0].data.email, "");
    assert.equal(
      (await db.query("select * from email_messages")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from email_subscriptions")).rows.length,
      0,
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from checkout_contact_drafts"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec(
      "update checkout_contact_drafts set expires_at=now()-interval '1 second';select clean_old_carts()",
    );
    assert.equal((await rows()).length, 0);
    await save(session, { ...blank, firstName: "Анна" }, now + 5);
    await db.query("insert into orders(cart_session) values($1)", [session]);
    await db.exec("select clean_old_carts()");
    assert.equal((await rows()).length, 0);
    await save(session, { ...blank, firstName: "Поздний запрос" }, now + 6);
    assert.equal((await rows()).length, 0);
    await save(
      session,
      { ...blank, firstName: "Новое оформление" },
      Date.now() + 1,
    );
    assert.equal((await rows())[0].data.firstName, "Новое оформление");
  } finally {
    await db.close();
  }
});
