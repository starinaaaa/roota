import ts from "typescript";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { checkoutSchema } from "../lib/validation";
import { LEGAL_VERSION } from "../lib/legal";
import { validCourierContact, contactForChannel } from "../lib/courier-contact";
import { plannedReadyDate } from "../lib/production";
import { checkoutProgressInput } from "../lib/analytics/checkout-progress";
import { filterCatalog } from "../lib/catalog-filter";
import { manualDraftSchema } from "../lib/manual-orders";
import { selectionSchema } from "../lib/favorites";
import type { Product } from "../types";
const form = {
  name: "Анна Иванова",
  phone: "+79991234567",
  email: "anna@example.com",
  telegram: "",
  deliveryMethod: "yandex_courier",
  deliveryType: "moscow",
  address: "Москва, Тестовая 1",
  comment: "",
  legalVersion: LEGAL_VERSION,
  acceptedTerms: true,
};
async function database() {
  const db = new PGlite();
  await db.exec(await readFile("database/schema.sql", "utf8"));
  await db.exec("create role roota_app");
  for (const f of [
    "20261023_analytics_filters.sql",
    "20261025_garden.sql",
    "20261027_shop_workspace.sql",
  ])
    await db.exec(await readFile("database/migrations/" + f, "utf8"));
  await db.exec(
    "insert into email_templates(kind,subject,body,enabled) values('order_created','Заказ','Заказ',true),('order_paid','Оплачен','Оплачен',true)",
  );
  await db.exec(
    "insert into email_settings(id,enabled,marketing_enabled,test_mode) values(1,true,true,false)",
  );
  return db;
}
async function fixture(db: PGlite) {
  const category = randomUUID(),
    product = randomUUID(),
    session = randomUUID(),
    cart = randomUUID();
  await db.query(
    "insert into categories(id,slug,name) values($1,$2,'Тарелки')",
    [category, category],
  );
  await db.query(
    "insert into products(id,category_id,slug,name,description,price,stock_qty,publication_status,preorder_enabled,lead_time_days) values($1::uuid,$2,$1::text,'Тарелка','Описание',1200,5,'published',true,21)",
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
  return { product, session, cart };
}
test("courier accepts each chosen channel, prefills existing contact and rejects malformed values", () => {
  for (const [contactChannel, contactValue] of [
    ["telegram", "@anna_ceramics"],
    ["email", "anna@example.com"],
    ["instagram", "@anna.ceramics"],
  ])
    assert.equal(
      checkoutSchema.safeParse({ ...form, contactChannel, contactValue })
        .success,
      true,
    );
  for (const [channel, value] of [
    ["telegram", "anna_ceramics"],
    ["telegram", "@a!"],
    ["instagram", "@a..b"],
    ["instagram", "@.a"],
    ["instagram", "@a."],
    ["email", "a@b"],
    ["email", "a@b..ru"],
  ])
    assert.equal(validCourierContact(channel as "email", value), false);
  assert.equal(checkoutSchema.safeParse(form).success, false);
  assert.equal(
    contactForChannel("telegram", { telegram: "@anna_ceramics" }),
    "@anna_ceramics",
  );
  assert.equal(contactForChannel("email", { email: form.email }), form.email);
  assert.equal(
    contactForChannel("instagram", { telegram: "anna_ceramics" }),
    "",
  );
  assert.equal(plannedReadyDate("2026-10-27T22:30:00Z", 21), "2026-11-18");
  assert.equal(plannedReadyDate(null, 21), null);
  assert.equal(
    checkoutProgressInput.safeParse({
      stage: "validation_error",
      method: "ozon_point",
      field: "email",
      code: "EMAIL_INVALID",
    }).success,
    true,
  );
  assert.equal(
    checkoutProgressInput.safeParse({
      stage: "validation_error",
      method: "ozon_point",
      field: "email",
      code: "anna@example.com",
    }).success,
    false,
  );
});
test("catalogue search, price bounds and sort combine without mutating products; garden selections validate composition", () => {
  const products = [
    {
      id: "a",
      name: "Синяя чашка",
      description: "Керамика",
      price: 2000,
      created_at: "2026-01-01",
      in_stock: true,
      stock_qty: 1,
    },
    {
      id: "b",
      name: "Белая чашка",
      description: "Керамика",
      price: 1000,
      created_at: "2026-02-01",
      in_stock: true,
      stock_qty: 2,
    },
    {
      id: "c",
      name: "Ваза",
      description: "Керамика",
      price: 3000,
      created_at: "2026-03-01",
      in_stock: false,
      stock_qty: 0,
    },
  ] as Product[];
  assert.deepEqual(
    filterCatalog(products, {
      q: "ЧАШКА",
      min: "900",
      max: "2100",
      sort: "price_asc",
    }).map((p) => p.id),
    ["b", "a"],
  );
  assert.deepEqual(
    filterCatalog(products, { stock: "1", sort: "price_desc" }).map(
      (p) => p.id,
    ),
    ["a", "b"],
  );
  assert.equal(products[0].id, "a");
  assert.equal(
    selectionSchema.safeParse([
      {
        productId: randomUUID(),
        configuration: { size: 6, stems: 3, flowers: 2, leaves: 1 },
      },
    ]).success,
    true,
  );
  assert.equal(
    selectionSchema.safeParse([
      {
        productId: randomUUID(),
        configuration: { size: 6, stems: 0, flowers: 0, leaves: 0 },
      },
    ]).success,
    false,
  );
});
test("SQL courier channels reserve once, preserve contact and link corrected obstacles to successful orders", async () => {
  const db = await database();
  try {
    for (const [channel, value] of [
      ["email", form.email],
      ["instagram", "@anna.ceramics"],
      ["telegram", "@anna_ceramics"],
    ]) {
      const f = await fixture(db),
        key = randomUUID();
      await db.query(
        "select record_checkout_obstacle($1,'validation_error','address','ADDRESS_INVALID')",
        [f.session],
      );
      await db.query(
        "select record_checkout_obstacle($1,'validation_error','address','ADDRESS_INVALID')",
        [f.session],
      );
      assert.equal(
        (
          await db.query(
            "select * from checkout_obstacles where session_id=md5($1)",
            [f.session],
          )
        ).rows.length,
        1,
      );
      const data = { ...form, contactChannel: channel, contactValue: value };
      const result = (
        await db.query<{ pay: { order_id: string; id: string } }>(
          "select checkout_robokassa($1,$2,$3,1200,null,'live') pay",
          [f.session, key, data],
        )
      ).rows[0].pay;
      const retry = (
        await db.query<{ pay: { id: string } }>(
          "select checkout_robokassa($1,$2,$3,1200,null,'live') pay",
          [f.session, key, data],
        )
      ).rows[0].pay;
      assert.equal(retry.id, result.id);
      const {
        rows: [o],
      } = await db.query<{
        delivery_details: { coordination: string; contact: string };
      }>("select delivery_details from orders where id=$1", [result.order_id]);
      assert.equal(o.delivery_details.coordination, channel);
      assert.equal(o.delivery_details.contact, value);
      const {
        rows: [event],
      } = await db.query<{ order_id: string; corrected_at: string }>(
        "select * from checkout_obstacles where session_id=md5($1)",
        [f.session],
      );
      assert.equal(event.order_id, result.order_id);
      assert.ok(event.corrected_at);
      await db.query(
        "select record_checkout_obstacle($1,'validation_error','email','EMAIL_INVALID')",
        [f.session],
      );
      const {
        rows: [late],
      } = await db.query<{ order_id: string; corrected_at: Date }>(
        "select order_id,corrected_at from checkout_obstacles where session_id=md5($1) and field='email'",
        [f.session],
      );
      assert.equal(late.order_id, result.order_id);
      assert.ok(late.corrected_at);
      const {
        rows: [stock],
      } = await db.query<{ stock_qty: number }>(
        "select stock_qty from products where id=$1",
        [f.product],
      );
      assert.equal(stock.stock_qty, 4);
      const {
        rows: [move],
      } = await db.query<{ kind: string; order_id: string }>(
        "select kind,order_id from inventory_movements where product_id=$1 order by id desc limit 1",
        [f.product],
      );
      assert.equal(move.kind, "reserve");
      assert.equal(move.order_id, result.order_id);
      await db.query(
        "select change_order($1,'cancelled','pending','','','Покупатель отменил заказ',$2)",
        [result.order_id, randomUUID()],
      );
      const {
        rows: [release],
      } = await db.query<{ kind: string; balance: number }>(
        "select kind,balance from inventory_movements where product_id=$1 order by id desc limit 1",
        [f.product],
      );
      assert.equal(release.kind, "release");
      assert.equal(release.balance, 5);
    }
    const f = await fixture(db);
    await assert.rejects(
      db.query("select checkout_robokassa($1,$2,$3,1200,null,'live')", [
        f.session,
        randomUUID(),
        { ...form, contactChannel: "email", contactValue: "a@b" },
      ]),
      /INVALID_INPUT/,
    );
    await db.query("insert into analytics_excluded_sessions values(md5($1))", [
      f.session,
    ]);
    await db.query(
      "select record_checkout_obstacle($1,'validation_error','email','EMAIL_INVALID')",
      [f.session],
    );
    assert.equal(
      (
        await db.query(
          "select * from checkout_obstacles where session_id=md5($1)",
          [f.session],
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("manual confirmation is atomic and idempotent; production plans start at payment and aggregate garden parts", async () => {
  const db = await database();
  try {
    const f = await fixture(db),
      token = "a".repeat(64);
    const items = [
      {
        product_id: f.product,
        name: "Тарелка",
        quantity: 1,
        price: 1300,
        mode: "stock",
        lead_days: null,
        configuration: null,
      },
      {
        product_id: null,
        name: "Сад на заказ",
        quantity: 1,
        price: 2000,
        mode: "preorder",
        lead_days: 21,
        configuration: { size: 6, stems: 3, flowers: 2, leaves: 1 },
      },
    ];
    await db.query(
      "insert into manual_order_drafts(token,customer_name,email,phone,items,delivery_method,delivery_amount) values($1,$2,$3,$4,$5,'pickup',0)",
      [token, form.name, form.email, form.phone, items],
    );
    const pay = (
      await db.query<{ p: { id: string; order_id: string; amount: string } }>(
        "select accept_manual_order($1,$2) p",
        [token, form],
      )
    ).rows[0].p;
    assert.equal(Number(pay.amount), 3300);
    assert.equal(
      (
        await db.query<{ p: { id: string } }>(
          "select accept_manual_order($1,$2) p",
          [token, form],
        )
      ).rows[0].p.id,
      pay.id,
    );
    assert.equal(
      (await db.query("select * from production_tasks")).rows.length,
      0,
    );
    await db.query(
      "update payments set status='paid',paid_at='2026-10-27T22:30:00Z' where id=$1",
      [pay.id],
    );
    await db.query("update orders set payment_status='paid' where id=$1", [
      pay.order_id,
    ]);
    const {
      rows: [task],
    } = await db.query<{ ready_on: Date; stage: string }>(
      "select * from production_tasks",
    );
    assert.equal(
      new Date(task.ready_on).toISOString().slice(0, 10),
      "2026-11-18",
    );
    assert.equal(task.stage, "queued");
    await db.query("update orders set payment_status='paid' where id=$1", [
      pay.order_id,
    ]);
    assert.equal(
      (await db.query("select * from production_tasks")).rows.length,
      1,
    );
    const {
      rows: [parts],
    } = await db.query<{ stems: string; flowers: string; leaves: string }>(
      "select sum((i.configuration->>'stems')::int*i.quantity) stems,sum((i.configuration->>'flowers')::int*i.quantity) flowers,sum((i.configuration->>'leaves')::int*i.quantity) leaves from production_tasks t join order_items i on i.id=t.order_item_id",
    );
    assert.deepEqual(
      [Number(parts.stems), Number(parts.flowers), Number(parts.leaves)],
      [3, 2, 1],
    );
    assert.equal(
      (
        await db.query<{ stock_qty: number }>(
          "select stock_qty from products where id=$1",
          [f.product],
        )
      ).rows[0].stock_qty,
      4,
    );
    await db.query(
      "insert into orders(customer_id,customer_name,customer_phone,customer_email,total_amount,delivery_type,payment_status,created_at) select customer_id,customer_name,customer_phone,customer_email,1000,'pickup','paid','2026-10-26T12:00:00Z' from orders where id=$1",
      [pay.order_id],
    );
    await db.query(
      "insert into order_returns(order_id,amount,money_state,updated_at) values($1,500,'finished','2026-10-28T10:00:00Z')",
      [pay.order_id],
    );
    const financeSource = await readFile(
      "app/admin/(panel)/finance/page.tsx",
      "utf8",
    );
    const financeSql = financeSource
      .match(/`with period[\s\S]*?`/)?.[0]
      .slice(1, -1).replaceAll("${refundStamp}","coalesce(refunded_at,updated_at)");
    assert.ok(financeSql);
    const {
      rows: [report],
    } = await db.query<{
      orders: number;
      sales: string;
      refunds: string;
      repeat_orders: number;
    }>(financeSql, ["2026-10-27", "2026-10-28", []]);
    assert.equal(report.orders, 1);
    assert.equal(Number(report.sales), 3300);
    assert.equal(Number(report.refunds), 500);
    assert.equal(report.repeat_orders, 1);
    assert.equal(
      manualDraftSchema.safeParse({
        customer_name: form.name,
        email: form.email,
        phone: form.phone,
        items,
        delivery_method: "yandex_courier",
        delivery_address: "Москва 1",
        delivery_amount: 100,
        comment: "",
      }).success,
      false,
    );
  } finally {
    await db.close();
  }
});
test("collection campaigns deduplicate email, skip revoked consent and recheck unsubscribe at claim time", async () => {
  const db = await database();
  try {
    const f = await fixture(db),
      a = randomUUID(),
      b = randomUUID(),
      revoked = randomUUID();
    for (const [id, resource, rev] of [
      [a, "a", false],
      [b, "b", false],
      [revoked, "revoked", true],
    ] as const)
      await db.query(
        "insert into email_subscriptions(id,email,purpose,resource,token,direct_consent_at,revoked_at,consent_version) values($1,$2,'news',$3,$4,now(),case when $5 then now() end,'v1')",
        [
          id,
          rev ? "revoked@example.com" : "same@example.com",
          resource,
          randomUUID().replaceAll("-", "").repeat(2),
          rev,
        ],
      );
    const {
      rows: [campaign],
    } = await db.query<{ id: string }>(
      "insert into email_campaigns(name,subject,body,product_ids,recipient_ids,state,scheduled_at,tested_at) values('Коллекция','Тема','Текст',$1,$2,'scheduled',now(),now()) returning id",
      [[f.product], [a, b, revoked]],
    );
    await db.query("select prepare_collection_campaigns()");
    await db.query("select prepare_collection_campaigns()");
    const { rows: messages } = await db.query<{
      id: string;
      subscription_id: string;
      payload: { products: { name: string }[] };
    }>("select * from email_messages where campaign_id=$1", [campaign.id]);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].payload.products[0].name, "Тарелка");
    await db.query(
      "update email_subscriptions set revoked_at=now() where id=$1",
      [messages[0].subscription_id],
    );
    assert.equal(
      (await db.query("select * from claim_email_messages(10)")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select state from email_messages where id=$1",
          [messages[0].id],
        )
      ).rows[0].state,
      "cancelled",
    );
  } finally {
    await db.close();
  }
});

test("all new administrative SQL statements are compatible with the migrated schema", async () => {
  const db = await database();
  try {
    const files = [
      "lib/shop-operations.ts",
      "lib/actions/shop-operations.ts",
      "lib/actions/manual-orders.ts",
      "lib/actions/campaigns.ts",
      "lib/actions/selections.ts",
      "app/admin/(panel)/customers/page.tsx",
      "app/admin/(panel)/customers/[id]/page.tsx",
      "app/admin/(panel)/finance/page.tsx",
      "app/admin/(panel)/inventory/page.tsx",
      "app/admin/(panel)/checkout-errors/page.tsx",
      "app/admin/(panel)/orders/new/page.tsx",
      "app/admin/(panel)/campaigns/page.tsx",
      "app/admin/(panel)/campaigns/[id]/page.tsx",
    ];
    let checked = 0;
    for (const file of files) {
      const ast = ts.createSourceFile(
          file,
          await readFile(file, "utf8"),
          ts.ScriptTarget.Latest,
          true,
        ),
        sqls: string[] = [];
      function visit(n: ts.Node) {
        if (
          ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          n.expression.name.text === "query" &&
          n.arguments[0] &&
          (ts.isStringLiteral(n.arguments[0]) ||
            ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))
        )
          sqls.push(n.arguments[0].text);
        ts.forEachChild(n, visit);
      }
      visit(ast);
      for (const sql of sqls) {
        if (!/^\s*(select|with|insert|update|delete)/i.test(sql)) continue;
        const count = Math.max(
          0,
          ...[...sql.matchAll(/\$(\d+)/g)].map((x) => Number(x[1])),
        );
        await assert.doesNotReject(
          db.query("explain " + sql, Array(count).fill(null)),
          file,
        );
        checked++;
      }
    }
    assert.ok(checked >= 35);
  } finally {
    await db.close();
  }
});
