import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  amountInKopecks,
  callbackFields,
  verifyPaymentNotification,
  sdkFor,
  type PaymentRow,
} from "../lib/payments/model";

const env = {
  ROBOKASSA_MERCHANT_LOGIN: "roota",
  ROBOKASSA_HASH_ALGORITHM: "md5",
  ROBOKASSA_TEST_PASSWORD1: "test-one",
  ROBOKASSA_TEST_PASSWORD2: "test-two",
  ROBOKASSA_PASSWORD1: "live-one",
  ROBOKASSA_PASSWORD2: "live-two",
};
const pay = {
  id: randomUUID(),
  inv_id: "1000000000000",
  mode: "test",
  amount: "505.03",
} as PaymentRow;
function signed(p: PaymentRow, amount = "505.030000", password = "test-two") {
  const fields = {
    OutSum: amount,
    InvId: String(p.inv_id),
    Shp_mode: p.mode,
    Shp_payment: p.id,
    SignatureValue: "",
  };
  fields.SignatureValue = createHash("md5")
    .update(
      `${amount}:${p.inv_id}:${password}:Shp_mode=${p.mode}:Shp_payment=${p.id}`,
    )
    .digest("hex");
  return fields;
}
test("Result signature, exact amount, mode, invoice and payment binding", () => {
  verifyPaymentNotification(pay, signed(pay), env);
  assert.equal(amountInKopecks("505.030000"), BigInt(50503));
  assert.equal(amountInKopecks("505.03"), BigInt(50503));
  assert.throws(() => amountInKopecks("505.030001"));
  assert.throws(() => amountInKopecks("5e2"));
  assert.throws(() =>
    verifyPaymentNotification(
      pay,
      { ...signed(pay), SignatureValue: "a".repeat(32) },
      env,
    ),
  );
  assert.throws(
    () => verifyPaymentNotification(pay, signed(pay, "505.04"), env),
    /AMOUNT_MISMATCH/,
  );
  assert.throws(() =>
    verifyPaymentNotification(pay, signed(pay, "505.03", "live-two"), env),
  );
  assert.throws(
    () => verifyPaymentNotification(pay, { ...signed(pay), IsTest: "0" }, env),
    /MODE_MISMATCH/,
  );
  assert.throws(
    () =>
      verifyPaymentNotification(pay, signed({ ...pay, id: randomUUID() }), env),
    /PAYMENT_MISMATCH/,
  );
  assert.throws(() =>
    verifyPaymentNotification(pay, signed({ ...pay, mode: "live" }), env),
  );
  assert.throws(
    () => callbackFields("InvId=1&InvId=2&OutSum=1&SignatureValue=a"),
    /DUPLICATE_PARAMETER/,
  );
  const fields = sdkFor("test", env).payment.buildPaymentForm({
    OutSum: "505.03",
    InvID: pay.inv_id,
    Description: "Roota",
    ShpFields: { Shp_mode: "test", Shp_payment: pay.id },
  }).fields;
  assert.equal(fields.IsTest, "1");
  assert.equal(fields.MerchantLogin, "roota");
  assert.ok(!JSON.stringify(fields).includes("test-one"));
});

test("SQL payment checkout, callback rollback, idempotency, test isolation and RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;",
    );
    await db.exec(
      (await readFile("supabase/schema.sql", "utf8")).replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
    await db.exec(
      await readFile("tests/fixtures/production-additions.sql", "utf8"),
    );
    await db.exec(
      "grant usage on schema public to anon,authenticated,service_role;grant all on all tables in schema public to service_role;",
    );
    await db.exec(
      await readFile("supabase/migrations/202610050001_admin.sql", "utf8"),
    );
    const category = randomUUID(),
      product = randomUUID(),
      session = randomUUID(),
      cart = randomUUID(),
      quote = randomUUID(),
      key = randomUUID();
    await db.query(
      "insert into categories(id,slug,name) values($1,'plates','Тарелки')",
      [category],
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261006065907_ozon_delivery.sql",
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261006130211_robokassa_payments.sql",
        "utf8",
      ),
    );
    await db.query(
      "insert into products(id,category_id,slug,name,description,price,stock_qty,publication_status) values($1,$2,'plate','Тарелка','Описание',100,2,'published')",
      [product, category],
    );
    await db.query("insert into carts(id,session_id) values($1,$2)", [
      cart,
      session,
    ]);
    await db.query(
      "insert into cart_items(cart_id,product_id,quantity) values($1,$2,1)",
      [cart, product],
    );
    const rule = (
      await db.query<{ id: string; updated_at: string }>(
        "select * from delivery_packing_rules where weight_g=500",
      )
    ).rows[0];
    const form = {
      name: "Тест",
      phone: "+79991234567",
      email: "test@example.invalid",
      deliveryType: "russia",
      address: "Москва, ПВЗ",
      comment: "",
      deliveryQuoteId: quote,
    };
    const snapshot = [
      {
        product_id: product,
        category_id: category,
        quantity: 1,
        price: 100,
        purchase_mode: "stock",
      },
    ];
    await db.query(
      "insert into delivery_quotes(id,cart_session,phone,city,point,packing_rule_id,packing_updated_at,packing,cart_snapshot,shipment_method_id,goods_amount,delivery_amount,insurance_amount,checked_at,expires_at) values($1,$2,$3,'Москва',$4,$5,$6,$7,$8,1,100,400.01,5.02,now(),now()+interval '10 minutes')",
      [
        quote,
        session,
        form.phone,
        { id: 1, address: "Москва, ПВЗ" },
        rule.id,
        rule.updated_at,
        rule,
        snapshot,
      ],
    );
    const checkout = (mode: string, total = 505.03, k = key) =>
      db.query<{ result: PaymentRow }>(
        "select checkout_robokassa($1,$2,$3,$4,$5,$6) result",
        [session, k, form, total, quote, mode],
      );
    await assert.rejects(checkout("test", 1), /PRICE_CHANGED/);
    const sandbox = (await checkout("test")).rows[0].result;
    assert.equal((await checkout("test")).rows[0].result.id, sandbox.id);
    await assert.rejects(
      db.query("select checkout_robokassa($1,$2,$3,$4,$5,$6) result", [
        session,
        key,
        { ...form, name: "Изменено" },
        505.03,
        quote,
        "test",
      ]),
      /KEY_REUSED/,
    );
    const summary = async () =>
      (
        await db.query<{
          orders: number;
          customers: number;
          shipments: number;
          notifications: number;
          stock: number;
          cart: number;
        }>(
          `select (select count(*)::int from orders) orders,(select count(*)::int from customers) customers,(select count(*)::int from order_shipments) shipments,(select count(*)::int from notification_outbox) notifications,(select stock_qty from products limit 1) stock,(select count(*)::int from cart_items) cart`,
        )
      ).rows[0];
    assert.deepEqual(await summary(), {
      orders: 0,
      customers: 0,
      shipments: 0,
      notifications: 0,
      stock: 2,
      cart: 1,
    });
    const confirm = (p: PaymentRow, amount = 505.03, mode = p.mode) =>
      db.query("select confirm_robokassa($1,$2,$3,$4)", [
        p.id,
        p.inv_id,
        amount,
        mode,
      ]);
    await assert.rejects(confirm(sandbox, 505.04), /PAYMENT_MISMATCH/);
    await assert.rejects(confirm(sandbox, 505.03, "live"), /PAYMENT_MISMATCH/);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from payments where id=$1",
          [sandbox.id],
        )
      ).rows[0].status,
      "pending",
    );
    await confirm(sandbox);
    await confirm(sandbox);
    assert.deepEqual(await summary(), {
      orders: 0,
      customers: 0,
      shipments: 0,
      notifications: 0,
      stock: 2,
      cart: 1,
    });
    const live = (await checkout("live", 505.03, randomUUID())).rows[0].result;
    assert.equal(live.test_order_id, null);
    assert.ok(live.order_id);
    // Before ResultURL, neither a browser return nor a failed attempt can mark it paid.
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select payment_status status from orders",
        )
      ).rows[0].status,
      "pending",
    );
    await assert.rejects(
      db.query(
        "select change_order($1,'new','paid','','','ручная оплата',$2)",
        [live.order_id, randomUUID()],
      ),
      /ROBOKASSA_PAYMENT_MANAGED/,
    );
    await db.exec(
      "create function fail_event() returns trigger language plpgsql as $$begin raise exception 'INJECTED';end$$;create trigger fail_event before insert on order_events for each row execute function fail_event();",
    );
    await assert.rejects(confirm(live), /INJECTED/);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from payments where id=$1",
          [live.id],
        )
      ).rows[0].status,
      "pending",
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select payment_status status from orders",
        )
      ).rows[0].status,
      "pending",
    );
    await db.exec(
      "drop trigger fail_event on order_events;drop function fail_event();",
    );
    await db.query(
      "update orders set total_amount=total_amount+1 where id=$1",
      [live.order_id],
    );
    await assert.rejects(confirm(live), /ORDER_MISMATCH/);
    await db.query(
      "update orders set total_amount=total_amount-1 where id=$1",
      [live.order_id],
    );
    await confirm(live);
    await confirm(live);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from order_events where kind='payment'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select payment_status status from orders",
        )
      ).rows[0].status,
      "paid",
    );
    await assert.rejects(
      db.query(
        "select change_order($1,'new','failed','','','ошибка оплаты',$2)",
        [live.order_id, randomUUID()],
      ),
      /ROBOKASSA_PAYMENT_MANAGED/,
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select * from payments"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("update payments set status='paid'"),
        /permission denied/,
      );
      await assert.rejects(confirm(live), /permission denied/);
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});
