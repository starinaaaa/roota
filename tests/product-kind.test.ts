import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { productBadge } from "../lib/product-badge";
import { productSchema } from "../lib/validation";

test("unique items have their own availability text and cannot enable repeat production", () => {
  assert.equal(
    productBadge({ in_stock: true, stock_qty: 1, product_kind: "unique" }),
    "Единственный экземпляр",
  );
  assert.equal(
    productBadge({ in_stock: true, stock_qty: 1, product_kind: "batch" }),
    "Осталась 1 шт.",
  );
  assert.equal(
    productBadge({ in_stock: false, stock_qty: 0, product_kind: "unique" }),
    "Нет в наличии",
  );
  const base = {
    name: "Ваза",
    slug: "vaza",
    description: "Описание",
    category_id: null,
    price: 100,
    stock_qty: 1,
    publication_status: "draft",
    preorder_enabled: false,
    lead_time_days: null,
    featured: false,
    product_kind: "unique",
    dishwasher_safe: null,
    microwave_safe: null,
  };
  assert.equal(productSchema.safeParse(base).success, true);
  assert.equal(
    productSchema.safeParse({ ...base, stock_qty: 2 }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      ...base,
      preorder_enabled: true,
      lead_time_days: 20,
    }).success,
    false,
  );
});

test("database restricts unique inventory and atomically saves its kind without removing the email wrapper", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table products(id uuid primary key,name text,slug text unique,description text,category_id uuid,price integer,stock_qty integer default 0,material text,dimensions text,weight text,capacity_ml integer,care text,dishwasher_safe boolean,microwave_safe boolean,publication_status text,preorder_enabled boolean default false,lead_time_days integer,featured boolean,seo_title text,seo_description text,updated_at timestamptz default now());
create table orders(id uuid primary key,reservation_state text);
create table order_items(order_id uuid,product_id uuid,purchase_mode text);
create table product_redirects(old_slug text primary key,product_id uuid);
create table product_images(id uuid,product_id uuid,storage_path text,public_url text,bucket text,alt_text text,sort_order integer,is_primary boolean);
create function save_product(uuid,jsonb,jsonb,timestamptz default null) returns uuid language plpgsql as $$ begin return public.save_product_without_email($1,$2,$3,$4); end $$;`);
    await db.exec(
      await readFile(
        "supabase/migrations/20261014094529_product_kind.sql",
        "utf8",
      ),
    );
    const id = "00000000-0000-4000-8000-000000000001";
    const input = {
      name: "Ваза",
      slug: "vaza",
      price: 100,
      stock_qty: 1,
      preorder_enabled: false,
      publication_status: "draft",
      product_kind: "unique",
    };
    await db.query("select save_product($1,$2,$3,null)", [
      id,
      JSON.stringify(input),
      "[]",
    ]);
    assert.equal(
      (
        await db.query<{ product_kind: string }>(
          "select product_kind from products where id=$1",
          [id],
        )
      ).rows[0].product_kind,
      "unique",
    );
    await assert.rejects(
      db.query("update products set stock_qty=2 where id=$1", [id]),
      /products_unique_inventory/,
    );
    await assert.rejects(
      db.query("update products set preorder_enabled=true where id=$1", [id]),
      /products_unique_inventory/,
    );
    await db.query("update products set stock_qty=0 where id=$1", [id]);
    await db.exec(
      `insert into orders values('00000000-0000-4000-8000-000000000002','active');insert into order_items values('00000000-0000-4000-8000-000000000002','${id}','stock');`,
    );
    const stamp = (
      await db.query<{ updated_at: Date }>(
        "select updated_at from products where id=$1",
        [id],
      )
    ).rows[0].updated_at;
    await assert.rejects(
      db.query("select save_product($1,$2,$3,$4)", [
        id,
        JSON.stringify(input),
        "[]",
        stamp,
      ]),
      /UNIQUE_ALREADY_RESERVED/,
    );
    await assert.rejects(
      db.exec(
        `set role anon;select save_product_without_email('${id}','{}','[]',null);`,
      ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
