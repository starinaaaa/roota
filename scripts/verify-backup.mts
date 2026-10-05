import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";

const target = process.argv[2];
if (!target || !path.isAbsolute(target))
  throw new Error("An absolute backup directory is required");
const manifest = JSON.parse(
  await readFile(path.join(target, "manifest.json"), "utf8"),
);
const db = new PGlite();
try {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
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
  const tables = [
    "categories",
    "products",
    "product_images",
    "customers",
    "carts",
    "orders",
    "cart_items",
    "order_items",
    "waitlist",
    "preorders",
  ];
  for (const table of tables)
    await db.exec(`alter table public.${table} disable trigger user;`);
  for (const table of tables) {
    const rows = JSON.parse(
      await readFile(path.join(target, table + ".json"), "utf8"),
    );
    for (const row of rows) {
      const columns = Object.keys(row);
      if (columns.some((c) => !/^\w+$/.test(c)))
        throw new Error("Invalid column");
      await db.query(
        `insert into public.${table}(${columns.join(",")}) values(${columns.map((_, i) => "$" + (i + 1)).join(",")})`,
        columns.map((c) => row[c]),
      );
    }
    assert.equal(rows.length, manifest.tables[table]);
  }
  for (const table of tables)
    await db.exec(`alter table public.${table} enable trigger user;`);
  const stockBefore = (
    await db.query("select id,stock_qty from products order by id")
  ).rows;
  await db.exec(
    await readFile("supabase/migrations/202610050001_admin.sql", "utf8"),
  );
  assert.deepEqual(
    (await db.query("select id,stock_qty from products order by id")).rows,
    stockBefore,
  );
  for (const table of tables)
    assert.equal(
      (await db.query<{ n: number }>(`select count(*)::int n from ${table}`))
        .rows[0].n,
      manifest.tables[table],
    );
  for (const file of manifest.files) {
    const bytes = await readFile(
      path.join(target, "storage", file.bucket, file.path),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  }
  console.log(
    JSON.stringify({
      restoredTables: tables.length,
      verifiedFiles: manifest.files.length,
      migrationPreservedCountsAndStock: true,
    }),
  );
} catch {
  throw new Error(
    "Backup verification failed; details suppressed to keep buyer information out of logs",
  );
} finally {
  await db.close();
}
