import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { normalizeRussianPhone, formatRussianPhone } from "../lib/contacts";
import { checkoutSchema } from "../lib/validation";
import {
  packingFor,
  pointInCity,
  moneyToKopecks,
  type PackingRule,
} from "../lib/delivery/model";
import {
  OzonTransport,
  OzonAuthError,
  activeShipmentMethod,
} from "../lib/delivery/ozon-transport";

test("Russian contact input accepts supported forms and rejects foreign, long and incomplete input", () => {
  for (const input of [
    "9991234567",
    "89991234567",
    "+79991234567",
    "+7 (999) 123-45-67",
    " 8 999 123 45 67 ",
  ])
    assert.equal(normalizeRussianPhone(input), "+79991234567");
  for (const input of [
    "+19991234567",
    "+749912345678",
    "899912345",
    "+7999",
    "+7+9991234567",
    "+7a9991234567",
    "+9991234567",
  ])
    assert.equal(normalizeRussianPhone(input), null, input);
  assert.equal(formatRussianPhone("9991234567"), "+7 (999) 123-45-67");
  const form = {
    name: "Анна",
    phone: "+79991234567",
    email: " name+order@example.ru ",
    deliveryType: "russia",
    address: "Москва, ПВЗ",
    comment: "",
  };
  assert.equal(checkoutSchema.parse(form).email, "name+order@example.ru");
  for (const email of [
    "@example.ru",
    "a@@example.ru",
    "a@ru",
    "a@.ru",
    "a@ex..ru",
    "a @example.ru",
    "a@example.",
  ])
    assert.equal(
      checkoutSchema.safeParse({ ...form, email }).success,
      false,
      email,
    );
});

test("packing uses exact complete composition and never extrapolates unsupported carts", () => {
  const base = {
    id: "one",
    name: "Одна",
    composition: [{ category_id: "plates", quantity: 1 }],
    active: true,
    updated_at: "now",
    weight_g: 500,
    length_mm: 230,
    width_mm: 230,
    height_mm: 50,
  };
  const two = {
    ...base,
    id: "two",
    composition: [{ category_id: "plates", quantity: 2 }],
    weight_g: 800,
    height_mm: 70,
  };
  const item = {
    product_id: "p",
    category_id: "plates",
    quantity: 1,
    price: 100,
    purchase_mode: "stock",
  };
  assert.equal(packingFor([item], [base, two] as PackingRule[]).weight_g, 500);
  assert.equal(
    packingFor([item, { ...item, product_id: "q" }], [
      base,
      two,
    ] as PackingRule[]).height_mm,
    70,
  );
  assert.throws(
    () => packingFor([{ ...item, quantity: 3 }], [base, two] as PackingRule[]),
    /упаковка/,
  );
  assert.throws(
    () =>
      packingFor([item, { ...item, category_id: "glasses" }], [
        base,
        two,
      ] as PackingRule[]),
    /упаковка/,
  );
  assert.throws(
    () =>
      packingFor([item], [base, { ...base, id: "duplicate" }] as PackingRule[]),
    /упаковка/,
  );
  assert.equal(moneyToKopecks("400.01"), 40001);
  for (const price of [undefined, null, "free", "-1", "1.001", "NaN"])
    assert.throws(() => moneyToKopecks(price));
});

test("Ozon transport preserves body and cookies through testcookie redirects and never leaks credentials to another host", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const body = { client_id: "id", client_secret: "secret" };
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    if (calls.length === 1)
      return new Response(null, {
        status: 307,
        headers: {
          location: "/oauth/token?checked=1",
          "set-cookie": "check=ok; Path=/",
        },
      });
    if (calls.length === 2)
      return Response.json({ access_token: "token", expires_in: 3600 });
    if (calls.length === 3)
      return new Response(null, {
        status: 302,
        headers: {
          location: "/v1/order/create?checked=1",
          "set-cookie": "api=ok; Path=/",
        },
      });
    return Response.json({ ok: true });
  }) as typeof fetch;
  const transport = new OzonTransport(
    body.client_id,
    body.client_secret,
    fetcher,
  );
  await transport.call(
    "/v1/order/create",
    { order_external_id: "order" },
    "key",
  );
  assert.equal(calls[0].init.body, calls[1].init.body);
  assert.equal(
    (calls[1].init.headers as Record<string, string>).Cookie,
    "check=ok",
  );
  assert.equal(calls[2].init.body, calls[3].init.body);
  assert.equal(
    (calls[3].init.headers as Record<string, string>)["Idempotency-Key"],
    "key",
  );
  assert.equal(
    (calls[3].init.headers as Record<string, string>).Cookie,
    "api=ok",
  );
  const bad = new OzonTransport(
    "id",
    "secret",
    (async () =>
      new Response(null, {
        status: 307,
        headers: { location: "https://example.com/steal" },
      })) as typeof fetch,
  );
  await assert.rejects(bad.call("/v1/order/create", {}), /соединения/);
});

test("delivery checkout adds exact charges, rejects tampering and stale quotes, and remains atomic and idempotent", async () => {
  const db = new PGlite();
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
    "grant usage on schema public to anon,authenticated,service_role;grant all on all tables in schema public to service_role;grant select on products,product_images,categories,products_with_primary_image to anon,authenticated;",
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
    await db.query<PackingRule>(
      "select * from delivery_packing_rules where weight_g=500",
    )
  ).rows[0];
  const snapshot = [
    {
      product_id: product,
      category_id: category,
      quantity: 1,
      price: 100,
      purchase_mode: "stock",
    },
  ];
  const form = {
    name: "Анна",
    phone: "+79991234567",
    email: "anna@example.ru",
    deliveryType: "russia",
    address: "Москва, ПВЗ",
    comment: "",
    subscribeToNews: false,
    deliveryQuoteId: quote,
  };
  await db.query(
    "insert into delivery_quotes(id,cart_session,phone,city,point,packing_rule_id,packing_updated_at,packing,cart_snapshot,shipment_method_id,goods_amount,delivery_amount,insurance_amount,checked_at,expires_at) values($1,$2,$3,'Москва',$4,$5,$6,$7,$8,1,100,400.01,5.02,now(),now()+interval '10 minutes')",
    [
      quote,
      session,
      form.phone,
      { id: 1, name: "ПВЗ", address: "Москва, ПВЗ" },
      rule.id,
      rule.updated_at,
      rule,
      snapshot,
    ],
  );
  const call = (total = 505.03, sessionId = session) =>
    db.query<{ result: { id: string } }>(
      "select checkout_delivery_order($1,$2,$3,$4,$5) result",
      [sessionId, key, form, total, quote],
    );
  await assert.rejects(call(100), /PRICE_CHANGED/);
  await assert.rejects(call(505.03, randomUUID()), /DELIVERY_EXPIRED/);
  await db.exec(
    "update delivery_quotes set checked_at=now()-interval '2 minutes'",
  );
  await assert.rejects(call(), /DELIVERY_EXPIRED/);
  await db.exec("update delivery_quotes set checked_at=now()");
  await db.exec("update cart_items set quantity=2");
  await assert.rejects(call(), /CART_CHANGED/);
  await db.exec("update cart_items set quantity=1");
  await db.exec(
    "create function reject_item() returns trigger language plpgsql as $$ begin raise exception 'LATE_FAILURE';end $$;create trigger reject_item before insert on order_items for each row execute function reject_item();",
  );
  await assert.rejects(call(), /LATE_FAILURE/);
  assert.equal(
    (await db.query<{ n: number }>("select count(*)::int n from orders"))
      .rows[0].n,
    0,
  );
  await db.exec(
    "drop trigger reject_item on order_items;drop function reject_item()",
  );
  const result = (await call()).rows[0].result;
  const order = (
    await db.query<{ total_amount: string; delivery_amount: string }>(
      "select total_amount,delivery_amount from orders where id=$1",
      [result.id],
    )
  ).rows[0];
  assert.equal(Number(order.total_amount), 505.03);
  assert.equal(Number(order.delivery_amount), 400.01);
  assert.equal((await call()).rows[0].result.id, result.id);
  await assert.rejects(call(505.04), /KEY_REUSED/);
  await assert.rejects(
    db.query("select claim_delivery_shipment($1,$2)", [result.id, {}]),
    /ORDER_NOT_READY/,
  );
  await db.exec("update orders set status='confirmed',payment_status='paid'");
  const claim = (
    await db.query<{
      result: { idempotency_key: string; request_payload: unknown };
    }>("select claim_delivery_shipment($1,$2) result", [
      result.id,
      { frozen: 1 },
    ])
  ).rows[0].result;
  await assert.rejects(
    db.query("select claim_delivery_shipment($1,$2)", [
      result.id,
      { frozen: 2 },
    ]),
    /SHIPMENT_IN_PROGRESS/,
  );
  await db.exec("update order_shipments set state='failed'");
  const retry = (
    await db.query<{
      result: { idempotency_key: string; request_payload: unknown };
    }>("select claim_delivery_shipment($1,$2) result", [
      result.id,
      { frozen: 2 },
    ])
  ).rows[0].result;
  assert.equal(retry.idempotency_key, claim.idempotency_key);
  assert.deepEqual(retry.request_payload, { frozen: 1 });
  await db.exec("set role anon");
  await assert.rejects(
    db.query("select * from delivery_quotes"),
    /permission denied/,
  );
  await assert.rejects(call(), /permission denied/);
  await db.close();
});

test("shipment method is discovered only when uniquely active and explicit IDs are rechecked", async () => {
  const calls: string[] = [];
  const transport = {
    call: async <T>(path: string): Promise<T> => {
      calls.push(path);
      return (
        path.endsWith("/search")
          ? {
              shipment_methods: [
                { shipment_method_id: 42, name: "тарелки", status: "active" },
              ],
            }
          : { shipment_methods: [{ shipment_method_id: 42, status: "active" }] }
      ) as T;
    },
  };
  assert.equal(await activeShipmentMethod(transport), 42);
  assert.deepEqual(calls, [
    "/v1/shipment-method/search",
    "/v1/shipment-method/info",
  ]);
  await assert.rejects(
    activeShipmentMethod({
      call: async <T>() =>
        ({
          shipment_methods: [
            { shipment_method_id: 1, status: "active" },
            { shipment_method_id: 2, status: "active" },
          ],
        }) as T,
    }),
    /один активный/,
  );
  await assert.rejects(
    activeShipmentMethod(
      { call: async <T>() => ({ shipment_methods: [] }) as T },
      "42",
    ),
    /неактивен/,
  );
  await assert.rejects(
    activeShipmentMethod(transport, "oops"),
    /OZON_SHIPMENT_METHOD_ID/,
  );
});

test("city filter does not mistake a street or region for the selected city", () => {
  assert.equal(
    pointInCity("Россия, Москва, улица Яблочкова, 43в", "Москва"),
    true,
  );
  assert.equal(
    pointInCity("Россия, Московская область, г. Москва, улица А", "Москва"),
    true,
  );
  assert.equal(pointInCity("Россия, Тула, улица Москва, 1", "Москва"), false);
  assert.equal(
    pointInCity("Россия, Санкт-Петербург, улица А", "Санкт-Петербург"),
    true,
  );
});

test("OAuth errors expose only a safe diagnostic category", async () => {
  const transport = new OzonTransport("id", "secret", (async () =>
    Response.json(
      {
        code: 3,
        message: "invalid GetTokenRequest.ClientId: value must be a valid UUID",
      },
      { status: 400 },
    )) as typeof fetch);
  await assert.rejects(
    transport.call("/v1/shipment-method/search", {}),
    (error: unknown) =>
      error instanceof OzonAuthError &&
      error.status === 400 &&
      error.reason === "client_id_format" &&
      !error.message.includes("GetTokenRequest"),
  );
});
