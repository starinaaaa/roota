import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  defaultGarden,
  gardenCount,
  gardenConfigurationSchema,
  gardenPrice,
  gardenName,
  gardenSizes,
} from "../lib/garden";
import {
  cartSnapshot,
  packingForParcels,
  type DeliveryContext,
  type PackingRule,
} from "../lib/delivery/model";

test("garden presets, substitutions and loose pieces have consistent prices", () => {
  assert.deepEqual(gardenSizes.map(s => s.name), ["Комнатный садик", "Палисадник", "Садовый дворик", "Оранжерея"]);
  assert.deepEqual(
    gardenSizes.map((size) => gardenPrice(defaultGarden(size.size)).total),
    [2000, 2470, 3510, 6630],
  );
  for (const size of gardenSizes) {
    const c = defaultGarden(size.size);
    assert.equal(gardenCount(c), size.size);
    assert.equal(gardenConfigurationSchema.safeParse(c).success, true);
    assert.equal(
      gardenPrice({ ...c, stems: c.stems - 1, flowers: c.flowers + 1 }).total,
      gardenPrice(c).total,
    );
    assert.ok(
      gardenPrice({ ...c, stems: c.stems - 1, leaves: c.leaves + 1 }).total <
        gardenPrice(c).total,
    );
  }
  assert.equal(
    gardenPrice({ size: 0, stems: 0, flowers: 0, leaves: 1 }).total,
    250,
  );
  for (const c of [
    { size: 6, stems: 3, flowers: 1, leaves: 1 },
    { size: 6, stems: -1, flowers: 6, leaves: 1 },
    { size: 6, stems: 3.5, flowers: 1.5, leaves: 1 },
    { ...defaultGarden(), price: 1 },
    { size: 0, stems: 100, flowers: 100, leaves: 0 },
  ])
    assert.equal(gardenConfigurationSchema.safeParse(c).success, false);
});

test("each garden gets its own parcel, mixed orders retain plate packing, snapshots detect same-price edits", () => {
  const category = randomUUID(),
    plate = randomUUID();
  const rule = (size: number): PackingRule => ({
    id: randomUUID(),
    name: `Сад ${size}`,
    active: true,
    garden_size: size,
    composition: [{ category_id: category, quantity: 1 }],
    weight_g: size * 65,
    length_mm: 150,
    width_mm: 150,
    height_mm: 150,
    updated_at: new Date().toISOString(),
  });
  const rules = [
    rule(6),
    rule(8),
    rule(12),
    rule(24),
    {
      ...rule(6),
      garden_size: null,
      composition: [{ category_id: plate, quantity: 1 }],
    },
  ];
  const items: DeliveryContext["items"] = [6, 12].map((size) => ({
    product_id: "garden",
    category_id: category,
    line_id: randomUUID(),
    configuration: defaultGarden(size as 6 | 12),
    quantity: 1,
    price: gardenPrice(defaultGarden(size as 6 | 12)).total,
    purchase_mode: "preorder",
  }));
  const plan = packingForParcels(
    [
      ...items,
      {
        product_id: "plate",
        category_id: plate,
        quantity: 1,
        price: 1200,
        purchase_mode: "stock",
      },
    ],
    rules,
    plate,
  );
  assert.equal(plan.parcels?.length, 3);
  assert.deepEqual(
    plan.parcels?.map((p) => p.packing.weight_g),
    [390, 780, 390],
  );
  const reordered = JSON.parse(JSON.stringify(items));
  reordered[0].configuration = { leaves: 1, flowers: 2, stems: 3, size: 6 };
  assert.equal(
    JSON.stringify(cartSnapshot(items)),
    JSON.stringify(cartSnapshot(reordered)),
  );
  const changed = structuredClone(items);
  changed[0].configuration!.stems--;
  changed[0].configuration!.flowers++;
  assert.equal(changed[0].price, items[0].price);
  assert.notDeepEqual(cartSnapshot(items), cartSnapshot(changed));
});

test("database preserves independent gardens, prevents tampering and freezes compositions in checkout and payment", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/schema.sql", "utf8"));
    await db.exec(
      await readFile("database/migrations/20261025_garden.sql", "utf8"),
    );
    await db.exec(await readFile("database/migrations/20261025_garden_names.sql", "utf8"));
    await db.exec(
      "insert into email_templates(kind,subject,body) values('order_created','Заказ','Заказ сохранён')",
    );
    const category = randomUUID(),
      garden = randomUUID(),
      plate = randomUUID(),
      session = randomUUID(),
      other = randomUUID();
    await db.query(
      "insert into categories(id,slug,name) values($1,'objects','Объекты')",
      [category],
    );
    await db.query(
      `insert into products(id,category_id,slug,name,description,price,stock_qty,publication_status,preorder_enabled,lead_time_days,configurator)
      values($1,$2,'sad','Сад','Конструктор',2000,0,'published',true,21,'garden'),($3,$2,'plate','Тарелка','Керамика',1200,3,'published',false,null,null)`,
      [garden, category, plate],
    );
    for (const preset of gardenSizes) {
      const named = await db.query<{ name: string }>("select garden_item_name(p,$2::jsonb) name from products p where id=$1", [garden, JSON.stringify(defaultGarden(preset.size))]);
      assert.ok(named.rows[0].name.startsWith(`Сад — ${gardenName(defaultGarden(preset.size))} (`));
    }
    const a = randomUUID(),
      b = randomUUID(),
      copy = randomUUID();
    const mutate = (
      line: string,
      config: unknown,
      operation = "add",
      who = session,
    ) =>
      db.query("select mutate_garden_cart($1,$2,$3::jsonb,$4,$5)", [
        who,
        garden,
        JSON.stringify(config),
        line,
        operation,
      ]);
    await db.query("select mutate_cart($1,$2,1,'add','stock')", [
      session,
      plate,
    ]);
    await mutate(a, defaultGarden(6));
    await mutate(b, defaultGarden(12));
    await mutate(copy, defaultGarden(6));
    await mutate(a, defaultGarden(6)); // Retry of the same add is idempotent.
    assert.equal(
      (await db.query<{ n: number }>("select count(*)::int n from cart_items"))
        .rows[0].n,
      4,
    );
    await assert.rejects(
      mutate(a, defaultGarden(8), "set", other),
      /UNAVAILABLE/,
    );
    await assert.rejects(mutate(a, null, "remove", other), /UNAVAILABLE/);
    await assert.rejects(
      mutate(randomUUID(), { ...defaultGarden(6), price: 1 }),
      /INVALID_GARDEN/,
    );
    await assert.rejects(
      mutate(randomUUID(), { size: 6, stems: 1, flowers: 1, leaves: 1 }),
      /INVALID_GARDEN/,
    );
    await assert.rejects(
      db.query("select mutate_cart($1,$2,1,'add','preorder')", [
        session,
        garden,
      ]),
      /INVALID_GARDEN/,
    );
    await mutate(a, { size: 6, stems: 2, flowers: 2, leaves: 2 }, "set");
    assert.deepEqual(
      (
        await db.query<{ c: object }>(
          "select configuration c from cart_items where id=$1",
          [copy],
        )
      ).rows[0].c,
      defaultGarden(6),
    );
    const form = {
      name: "Тест Покупатель",
      phone: "+79990000000",
      email: "garden@example.invalid",
      deliveryType: "moscow",
      deliveryMethod: "yandex_courier",
      telegram: "test_garden",
      address: "Москва, тестовый адрес",
      comment: "",
    };
    const total = 1900 + 3510 + 2000 + 1200;
    const rule = (
      await db.query<{
        id: string;
        updated_at: string;
      }>(`insert into delivery_packing_rules(name,composition,weight_g,length_mm,width_mm,height_mm)
      values('Тестовая упаковка','[{"category_id":"00000000-0000-4000-8000-000000000001","quantity":1}]',1000,150,150,150) returning id,updated_at`)
    ).rows[0];
    const snapshot = (
      await db.query<{ s: unknown }>(
        `select jsonb_agg(cart_line_snapshot(p,ci) order by p.id,ci.id) s
      from cart_items ci join products p on p.id=ci.product_id join carts c on c.id=ci.cart_id where c.session_id=$1`,
        [session],
      )
    ).rows[0].s;
    const quote = randomUUID();
    await db.query(
      `insert into delivery_quotes(id,cart_session,phone,city,point,packing_rule_id,packing_updated_at,packing,cart_snapshot,shipment_method_id,
      goods_amount,delivery_amount,insurance_amount,checked_at,expires_at)
      values($1,$2,$3,'Москва','{"id":1,"address":"Москва, тестовый ПВЗ"}',$4,$5,'{}',$6::jsonb,1,$7,100,20,now(),now()+interval '10 minutes')`,
      [
        quote,
        session,
        form.phone,
        rule.id,
        rule.updated_at,
        JSON.stringify(snapshot),
        total,
      ],
    );
    const ozonForm = {
      ...form,
      deliveryMethod: "ozon_point",
      deliveryType: "russia",
    };
    // A same-price replacement must invalidate a quote because the composition changed.
    await mutate(a, { size: 6, stems: 1, flowers: 3, leaves: 2 }, "set");
    await assert.rejects(
      db.query("select checkout_delivery_order($1,$2,$3::jsonb,$4,$5)", [
        session,
        randomUUID(),
        JSON.stringify(ozonForm),
        total + 120,
        quote,
      ]),
      /CART_CHANGED/,
    );
    await mutate(a, { size: 6, stems: 2, flowers: 2, leaves: 2 }, "set");
    const quotedPayment = (
      await db.query<{ p: { amount: number } }>(
        "select checkout_robokassa($1,$2,$3::jsonb,$4,$5,'test') p",
        [session, randomUUID(), JSON.stringify(ozonForm), total + 120, quote],
      )
    ).rows[0].p;
    assert.equal(Number(quotedPayment.amount), total + 120);
    const key = randomUUID();
    await assert.rejects(
      db.query("select checkout_robokassa($1,$2,$3::jsonb,1,null,'test')", [
        session,
        randomUUID(),
        JSON.stringify(form),
      ]),
      /PRICE_CHANGED/,
    );
    const payment = (
      await db.query<{
        p: { amount: number; items: { name: string; sum: number }[] };
      }>("select checkout_robokassa($1,$2,$3::jsonb,$4,null,'test') p", [
        session,
        key,
        JSON.stringify(form),
        total,
      ])
    ).rows[0].p;
    assert.equal(Number(payment.amount), total);
    assert.equal(payment.items.length, 4);
    assert.ok(
      payment.items.some(
        (i) =>
          i.name.includes("стебли: 2, цветочки: 2, листочки: 2") &&
          i.sum === 1900,
      ),
    );
    await assert.rejects(
      db.query("select checkout_order($1,$2,$3::jsonb,1)", [
        session,
        randomUUID(),
        JSON.stringify(form),
      ]),
      /PRICE_CHANGED/,
    );
    const orderKey = randomUUID();
    const order = (
      await db.query<{ o: { id: string } }>(
        "select checkout_delivery_order($1,$2,$3::jsonb,$4,null) o",
        [session, orderKey, JSON.stringify(form), total],
      )
    ).rows[0].o;
    const retried = (
      await db.query<{ o: { id: string } }>(
        "select checkout_delivery_order($1,$2,$3::jsonb,$4,null) o",
        [session, orderKey, JSON.stringify(form), total],
      )
    ).rows[0].o;
    assert.equal(retried.id, order.id);
    const snapshots = (
      await db.query<{
        price: number;
        configuration: unknown;
        lead_time_days: number;
      }>(
        "select price,configuration,lead_time_days from order_items where order_id=$1 and product_id=$2 order by price",
        [order.id, garden],
      )
    ).rows;
    assert.deepEqual(
      snapshots.map((s) => s.price),
      [1900, 2000, 3510],
    );
    assert.ok(
      snapshots.every((s) => s.lead_time_days === 21 && s.configuration),
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select stock_qty n from products where id=$1",
          [plate],
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select stock_qty n from products where id=$1",
          [garden],
        )
      ).rows[0].n,
      0,
    );
    await db.query(
      "update products set price=999999,name='Новое имя',lead_time_days=7 where id=$1",
      [garden],
    );
    const frozen = (
      await db.query<{ price: number; lead_time_days: number }>(
        "select price,lead_time_days from order_items where order_id=$1 and product_id=$2 order by price",
        [order.id, garden],
      )
    ).rows;
    assert.deepEqual(
      frozen,
      snapshots.map(({ price, lead_time_days }) => ({ price, lead_time_days })),
    );
  } finally {
    await db.close();
  }
});
