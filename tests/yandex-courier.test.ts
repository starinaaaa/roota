import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { checkoutSchema } from "../lib/validation";
import { LEGAL_VERSION } from "../lib/legal";
import { readCheckoutDraft } from "../lib/checkout-draft";

const form = {
  name: "Анна Иванова",
  phone: "+79991234567",
  email: "anna@example.com",
  telegram: "anna_ceramics",
  deliveryMethod: "yandex_courier",
  deliveryType: "moscow",
  address: "Москва, Тестовая 1",
  comment: "",
  legalVersion: LEGAL_VERSION,
  acceptedTerms: true,
};
test("courier requires Telegram and address and restores its draft", () => {
  assert.equal(checkoutSchema.safeParse(form).success, true);
  for (const override of [
    { telegram: "" },
    { telegram: "invalid!" },
    { address: "" },
    { address: "", deliveryType: "pickup" },
  ])
    assert.equal(
      checkoutSchema.safeParse({ ...form, ...override }).success,
      false,
    );
  const draft = readCheckoutDraft(
    JSON.stringify({
      ...form,
      firstName: "Анна",
      lastName: "Иванова",
      savedAt: Date.now(),
      delivery: null,
      emailConsent: false,
    }),
  );
  assert.equal(draft?.deliveryMethod, "yandex_courier");
  assert.equal(draft?.address, form.address);
});
test("manual courier charges goods only, preserves contact, reserves once, and does not create an Ozon shipment", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/schema.sql", "utf8"));
    await db.exec(
      await readFile("database/migrations/20261021_yandex_courier.sql", "utf8"),
    );
    await db.exec("insert into email_settings(id,enabled) values(1,false)");
    const category = randomUUID(),
      product = randomUUID();
    await db.query(
      "insert into categories(id,slug,name) values($1,'courier-plates','Тарелки')",
      [category],
    );
    await db.query(
      "insert into products(id,category_id,slug,name,description,price,stock_qty,publication_status) values($1,$2,'courier-plate','Тарелка','Описание',1200,5,'published')",
      [product, category],
    );
    async function cart() {
      const session = randomUUID(),
        id = randomUUID();
      await db.query("insert into carts(id,session_id) values($1,$2)", [
        id,
        session,
      ]);
      await db.query(
        "insert into cart_items(cart_id,product_id,quantity) values($1,$2,1)",
        [id, product],
      );
      return session;
    }
    const session = await cart(),
      key = randomUUID();
    const checkout = (
      s: string,
      k: string,
      f: unknown,
      total = 1200,
      mode = "live",
      quote: string | null = null,
    ) =>
      db.query<{
        result: {
          id: string;
          order_id: string;
          test_order_id: string;
          amount: string;
          items: { kind: string }[];
        };
      }>("select checkout_robokassa($1,$2,$3,$4,$5,$6) result", [
        s,
        k,
        f,
        total,
        quote,
        mode,
      ]);
    await assert.rejects(
      checkout(session, key, { ...form, telegram: "" }),
      /INVALID_INPUT/,
    );
    await assert.rejects(
      checkout(session, key, { ...form, address: "" }),
      /INVALID_INPUT/,
    );
    await assert.rejects(checkout(session, key, form, 1199), /PRICE_CHANGED/);
    await assert.rejects(
      checkout(session, key, form, 1200, "live", randomUUID()),
      /INVALID_INPUT/,
    );
    const pay = (await checkout(session, key, form)).rows[0].result;
    assert.equal(Number(pay.amount), 1200);
    assert.deepEqual(
      pay.items.map((i) => i.kind),
      ["goods"],
    );
    const order = (
      await db.query<{
        delivery_details: { provider: string; telegram: string };
        delivery_address: string;
        delivery_amount: string;
      }>(
        "select delivery_details,delivery_address,delivery_amount from orders where id=$1",
        [pay.order_id],
      )
    ).rows[0];
    assert.equal(order.delivery_details.provider, "yandex");
    assert.equal(order.delivery_details.telegram, form.telegram);
    assert.equal(order.delivery_address, form.address);
    assert.equal(Number(order.delivery_amount), 0);
    assert.equal(
      (
        await db.query("select * from order_shipments where order_id=$1", [
          pay.order_id,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (await checkout(session, key, form)).rows[0].result.id,
      pay.id,
    );
    await assert.rejects(
      checkout(session, key, { ...form, telegram: "other_user" }),
      /KEY_REUSED/,
    );
    assert.equal(
      (
        await db.query<{ stock_qty: number }>(
          "select stock_qty from products where id=$1",
          [product],
        )
      ).rows[0].stock_qty,
      4,
    );
    const testSession = await cart(),
      testKey = randomUUID();
    const testPay = (await checkout(testSession, testKey, form, 1200, "test"))
      .rows[0].result;
    assert.equal(Number(testPay.amount), 1200);
    assert.equal(testPay.order_id, null);
    assert.ok(testPay.test_order_id);
    assert.equal(
      (await checkout(testSession, testKey, form, 1200, "test")).rows[0].result
        .id,
      testPay.id,
    );
    assert.equal(
      (
        await db.query<{ stock_qty: number }>(
          "select stock_qty from products where id=$1",
          [product],
        )
      ).rows[0].stock_qty,
      4,
    );
    await assert.rejects(
      checkout(testSession, randomUUID(), {
        ...form,
        deliveryMethod: "ozon_point",
      }),
      /INVALID_INPUT/,
    );
  } finally {
    await db.close();
  }
});
