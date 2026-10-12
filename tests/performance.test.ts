import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import { preparedImageWidth } from "../lib/image-sizes";
import { prepareImageVariants } from "../lib/image-variants";

test("prepared photos respect sizes and preserve orientation without enlargement", async () => {
  const original = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "#b49167" },
  })
    .jpeg()
    .toBuffer();
  const variants = await prepareImageVariants(original);
  assert.equal(preparedImageWidth(400), 480);
  assert.equal(preparedImageWidth(9000), 2400);
  for (const variant of variants) {
    const metadata = await sharp(variant.data).metadata();
    assert.equal(metadata.format, "webp");
    assert.ok(metadata.width! <= variant.width);
    assert.ok(metadata.width! <= 1200);
    assert.ok(metadata.height! <= 800);
  }
  assert.ok(
    variants[0].data.length < variants[variants.length - 1].data.length,
  );
});

test("city dictionary and bounded cached pickup snapshots support all-city address search and deny public DB access", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create table delivery_points(provider text,id bigint,name text,address text,active boolean,data jsonb);grant usage on schema public to service_role,anon,authenticated;grant all on delivery_points to service_role;",
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261012135445_fast_delivery_catalog.sql",
        "utf8",
      ),
    );
    const rows = Array.from({ length: 260 }, (_, i) => ({
      id: i + 1,
      name: "Пункт " + i,
      address:
        "Россия, Москва, " +
        (i === 259 ? "Редкая улица" : "Тестовая улица") +
        ", " +
        i,
      lat: i < 130 ? 55.75 : 55.95,
      lon: 37.61,
    }));
    for (const p of rows)
      await db.query(
        "insert into delivery_points values('ozon',$1,$2,$3,true,$4)",
        [
          p.id,
          p.name,
          p.address,
          { coordinates: { latitude: p.lat, longitude: p.lon } },
        ],
      );
    await db.exec("set role service_role");
    await db.query("select refresh_delivery_city_catalog()");
    const cities = (
      await db.query<{ name: string }>(
        "select name from delivery_city_catalog where city_key like 'мос%' limit 12",
      )
    ).rows;
    assert.deepEqual(
      cities.map((c) => c.name),
      ["Москва"],
    );
    const slice = async (bounds: number[] | null = null, query = "") =>
      (
        await db.query<{
          data: { points: { id: number }[]; hasMore: boolean };
        }>(
          "select delivery_catalog_slice('москва',null,null,$1,$2,150) as data",
          [bounds, query],
        )
      ).rows[0].data;
    const near = await slice();
    assert.equal(near.points.length, 150);
    assert.equal(near.hasMore, true);
    assert.equal(near.points[0].id, 1);
    const area = await slice([55.94, 37.5, 55.96, 37.7]);
    assert.equal(area.points.length, 130);
    assert.equal(area.points[0].id, 131);
    assert.equal(area.hasMore, false);
    const search = await slice(null, "редкая");
    assert.equal(search.points[0].id, 260);
    await db.exec("reset role");
    await db.query("update delivery_points set active=false where id=260");
    await db.exec("set role service_role");
    await db.query("select refresh_delivery_city_catalog()");
    assert.equal((await slice(null, "редкая")).points.length, 0);
    assert.equal(
      (
        await db.query<{ city: string }>(
          "select delivery_address_city('Россия, Московская область, г. Мытищи, улица Мира') as city",
        )
      ).rows[0].city,
      "Мытищи",
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      () => db.query("select points from delivery_city_catalog"),
      /permission denied/,
    );
    await assert.rejects(() => slice(), /permission denied/);
  } finally {
    await db.close();
  }
});
