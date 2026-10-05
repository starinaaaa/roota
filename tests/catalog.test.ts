import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { defaultSite, siteSchema } from "../lib/site-schema";

async function base() {
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
  return db;
}
const form = {
  name: "Тест",
  phone: "+79990000000",
  email: "test@example.invalid",
  deliveryType: "pickup",
  address: "",
  comment: "",
};

test("legacy reservations migrate without double subtraction or restoration", async () => {
  const db = await base();
  try {
    const p = randomUUID(),
      c = randomUUID(),
      old = randomUUID(),
      session = randomUUID(),
      actor = randomUUID();
    await db.query(
      "insert into categories(id,name,slug) values($1,'Тест','test')",
      [c],
    );
    await db.query(
      "insert into products(id,category_id,name,slug,description,price,stock_qty) values($1,$2,'Изделие','test','Описание',100,3)",
      [p, c],
    );
    await db.query(
      "insert into orders(id,customer_name,customer_phone,total_amount,delivery_type) values($1,'Тест','+79990000000',100,'pickup')",
      [old],
    );
    await db.query(
      "insert into order_items(order_id,product_id,product_name,price,quantity) values($1,$2,'Изделие',100,1)",
      [old, p],
    );
    await db.exec(
      await readFile("supabase/migrations/202610050001_admin.sql", "utf8"),
    );
    assert.equal(
      (await db.query<{ n: number }>("select stock_qty n from products"))
        .rows[0].n,
      2,
    );
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select reservation_state state from orders",
        )
      ).rows[0].state,
      "active",
    );
    await db.query("select mutate_cart($1,$2,1,'add','stock')", [session, p]);
    const order = (
      await db.query<{ result: { id: string } }>(
        "select checkout_order($1,$2,$3,100) result",
        [session, randomUUID(), form],
      )
    ).rows[0].result;
    assert.equal(
      (await db.query<{ n: number }>("select stock_qty n from products"))
        .rows[0].n,
      1,
    );
    for (const id of [old, old, order.id, order.id])
      await db.query(
        "select change_order($1,'cancelled','pending','','','',$2)",
        [id, actor],
      );
    assert.equal(
      (await db.query<{ n: number }>("select stock_qty n from products"))
        .rows[0].n,
      3,
    );
  } finally {
    await db.close();
  }
});

test("preorders are explicit, snapshot their lead time, and never restore physical stock", async () => {
  const db = await base();
  try {
    await db.exec(
      await readFile("supabase/migrations/202610050001_admin.sql", "utf8"),
    );
    const p = randomUUID(),
      c = randomUUID(),
      session = randomUUID();
    await db.query(
      "insert into categories(id,name,slug) values($1,'Тест','test')",
      [c],
    );
    await db.query(
      "insert into products(id,category_id,name,slug,description,price,stock_qty,publication_status) values($1,$2,'Изделие','test','Описание',100,0,'published')",
      [p, c],
    );
    await assert.rejects(
      db.query("select mutate_cart($1,$2,1,'add','stock')", [session, p]),
      /OUT_OF_STOCK/,
    );
    await assert.rejects(
      db.query("select mutate_cart($1,$2,1,'add','preorder')", [session, p]),
      /PREORDER_DISABLED/,
    );
    await db.query(
      "update products set preorder_enabled=true,lead_time_days=14 where id=$1",
      [p],
    );
    await db.query("select mutate_cart($1,$2,2,'add','preorder')", [
      session,
      p,
    ]);
    const order = (
      await db.query<{ result: { id: string } }>(
        "select checkout_order($1,$2,$3,200) result",
        [session, randomUUID(), form],
      )
    ).rows[0].result;
    await db.query(
      "update products set lead_time_days=7,price=350 where id=$1",
      [p],
    );
    assert.deepEqual(
      (
        await db.query(
          "select price,lead_time_days,purchase_mode from order_items",
        )
      ).rows[0],
      { price: 100, lead_time_days: 14, purchase_mode: "preorder" },
    );
    for (let i = 0; i < 2; i++)
      await db.query(
        "select change_order($1,'cancelled','pending','','','',$2)",
        [order.id, randomUUID()],
      );
    assert.equal(
      (await db.query<{ n: number }>("select stock_qty n from products"))
        .rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("drafts, publication, redirects, site versions and stale stock edits", async () => {
  const db = await base();
  try {
    await db.exec(
      await readFile("supabase/migrations/202610050001_admin.sql", "utf8"),
    );
    const p = randomUUID(),
      c = randomUUID(),
      image = randomUUID();
    await db.query(
      "insert into categories(id,name,slug) values($1,'Тест','test')",
      [c],
    );
    const data = {
      name: "Изделие",
      slug: "first",
      description: "Описание",
      category_id: c,
      price: 100,
      stock_qty: 1,
      publication_status: "draft",
      preorder_enabled: false,
      featured: false,
    };
    const images = [
      {
        id: image,
        storage_path: `${p}/${image}.webp`,
        public_url: `/media/${p}/${image}`,
        bucket: "product-drafts",
        sort_order: 0,
        is_primary: true,
      },
    ];
    const save = (
      input: typeof data,
      timestamp: string | null,
      gallery = images,
    ) =>
      db.query("select save_product($1,$2,$3,$4)", [
        p,
        input,
        gallery,
        timestamp,
      ]);
    await save(data, null);
    await db.exec("set role anon;");
    assert.equal(
      (await db.query("select * from products_with_primary_image")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from product_images")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select * from site_drafts"),
      /permission denied/,
    );
    await db.exec("reset role;");
    const timestamp = async () =>
      (
        await db.query<{ v: string }>(
          "select updated_at::text v from products where id=$1",
          [p],
        )
      ).rows[0].v;
    await assert.rejects(
      save({ ...data, publication_status: "published" }, await timestamp(), []),
      /IMAGE_REQUIRED/,
    );
    await save({ ...data, publication_status: "published" }, await timestamp());
    const oldTimestamp = await timestamp();
    await db.query("update products set stock_qty=0 where id=$1", [p]);
    await assert.rejects(
      save({ ...data, publication_status: "published" }, oldTimestamp),
      /PRODUCT_CHANGED/,
    );
    await save(
      {
        ...data,
        slug: "second",
        stock_qty: 0,
        publication_status: "published",
      },
      await timestamp(),
    );
    await save(
      { ...data, slug: "third", stock_qty: 0, publication_status: "published" },
      await timestamp(),
    );
    assert.deepEqual(
      (
        await db.query(
          "select old_slug from product_redirects order by old_slug",
        )
      ).rows,
      [{ old_slug: "first" }, { old_slug: "second" }],
    );
    const draft = {
      ...defaultSite,
      heroTitle: "Новый заголовок",
      featuredIds: [p],
    };
    assert.equal(
      siteSchema.safeParse({ ...draft, telegram: "javascript:alert(1)" })
        .success,
      false,
    );
    await db.query("insert into site_drafts(id,payload) values(1,$1)", [draft]);
    assert.equal((await db.query("select * from site_pages")).rows.length, 0);
    await db.query("select publish_site($1)", [draft]);
    await db.exec("set role anon;");
    assert.equal(
      (
        await db.query<{ payload: { heroTitle: string } }>(
          "select payload from site_pages",
        )
      ).rows[0].payload.heroTitle,
      draft.heroTitle,
    );
    assert.equal(
      (await db.query("select * from products_with_primary_image")).rows.length,
      1,
    );
    await assert.rejects(save(data, await timestamp()), /permission denied/);
    await db.exec("reset role;");
  } finally {
    await db.close();
  }
});
