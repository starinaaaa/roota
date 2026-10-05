import { Pool } from "pg";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const socket = process.env.ROOTA_TEST_PG_SOCKET;
test(
  "PostgreSQL: simultaneous last-item checkout and duplicate submission",
  { skip: !socket },
  async () => {
    if (!socket?.startsWith("/"))
      throw new Error("Only a local Unix socket is permitted for this test");
    const config = { host: socket, port: 55439, user: "roota_test" };
    const control = new Pool({ ...config, database: "postgres" });
    const database = "roota_test_" + randomUUID().replaceAll("-", "");
    let db: Pool | undefined;
    try {
      await control.query(`create database ${database}`);
      await control.query(
        "do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; create role authenticated; create role service_role bypassrls; end if; end $$;",
      );
      db = new Pool({ ...config, database, max: 4 });
      await db.query(await readFile("supabase/schema.sql", "utf8"));
      await db.query(
        await readFile("tests/fixtures/production-additions.sql", "utf8"),
      );
      await db.query(
        await readFile("supabase/migrations/202610050001_admin.sql", "utf8"),
      );
      const product = randomUUID(),
        category = randomUUID(),
        sessionA = randomUUID(),
        sessionB = randomUUID();
      await db.query(
        "insert into categories(id,name,slug) values($1,'Тест','test')",
        [category],
      );
      await db.query(
        "insert into products(id,category_id,name,slug,description,price,stock_qty,publication_status) values($1,$2,'Изделие','test','Описание',100,1,'published')",
        [product, category],
      );
      for (const session of [sessionA, sessionB])
        await db.query("select mutate_cart($1,$2,1,'add','stock')", [
          session,
          product,
        ]);
      const form = {
        name: "Тест",
        phone: "+79990000000",
        email: "test@example.invalid",
        deliveryType: "pickup",
        address: "",
        comment: "",
      };
      const a = await db.connect(),
        b = await db.connect();
      try {
        await a.query("begin");
        const first = await a.query(
          "select checkout_order($1,$2,$3,100) result",
          [sessionA, randomUUID(), form],
        );
        // B runs while A still owns the product lock. It must recheck stock after A commits.
        const competing = b
          .query("select checkout_order($1,$2,$3,100)", [
            sessionB,
            randomUUID(),
            form,
          ])
          .then(
            () => ({ ok: true }),
            (error) => ({ ok: false, message: error.message }),
          );
        await a.query("commit");
        assert.deepEqual(await competing, {
          ok: false,
          message: "OUT_OF_STOCK",
        });
        assert.equal(
          (await db.query("select count(*)::int n from orders")).rows[0].n,
          1,
        );
        assert.equal(
          (await db.query("select stock_qty from products")).rows[0].stock_qty,
          0,
        );
        await db.query(
          "select change_order($1,'cancelled','pending','','','',$2)",
          [first.rows[0].result.id, randomUUID()],
        );
        await db.query("select mutate_cart($1,$2,1,'add','stock')", [
          sessionA,
          product,
        ]);
        const key = randomUUID();
        const duplicate = await Promise.all([
          a.query("select checkout_order($1,$2,$3,100) result", [
            sessionA,
            key,
            form,
          ]),
          b.query("select checkout_order($1,$2,$3,100) result", [
            sessionA,
            key,
            form,
          ]),
        ]);
        assert.equal(
          duplicate[0].rows[0].result.id,
          duplicate[1].rows[0].result.id,
        );
        assert.equal(
          (await db.query("select count(*)::int n from orders")).rows[0].n,
          2,
        );
        assert.equal(
          (await db.query("select stock_qty from products")).rows[0].stock_qty,
          0,
        );
      } finally {
        a.release();
        b.release();
      }
    } finally {
      await db?.end();
      await control.query(`drop database ${database}`);
      await control.end();
    }
  },
);
