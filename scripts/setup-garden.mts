import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { databaseConnectionUrl } from "../lib/db/connection";
import { gardenDescription, gardenCare } from "../lib/garden";

// Run with an owner connection after the application code is ready. Only local
// databases are accepted by default; --allow-remote is an explicit release step.
const url = databaseConnectionUrl(process.env);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
  !process.argv.includes("--allow-remote")
)
  throw new Error("REMOTE_DATABASE_REQUIRES_EXPLICIT_RELEASE");
const pool = new Pool({
  connectionString: url.toString(),
  ssl: ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    ? false
    : {
        rejectUnauthorized: true,
        ...(process.env.DATABASE_CA_BASE64
          ? {
              ca: Buffer.from(
                process.env.DATABASE_CA_BASE64,
                "base64",
              ).toString("utf8"),
            }
          : {}),
        ...(process.env.DATABASE_CA_FILE
          ? { ca: await readFile(process.env.DATABASE_CA_FILE, "utf8") }
          : {}),
      },
});
const db = await pool.connect();
try {
  const migrated = await db.query(
    "select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='configurator'",
  );
  if (!migrated.rowCount)
    await db.query(
      await readFile("database/migrations/20261025_garden.sql", "utf8"),
    );
  const flexible = await db.query<{ applied: boolean }>(
    "select position('garden-flexible-v1' in pg_get_functiondef('public.garden_price(jsonb)'::regprocedure))>0 and position('garden-production-v1' in pg_get_functiondef('public.change_order(uuid,text,text,text,text,text,uuid)'::regprocedure))>0 applied",
  );
  if (!flexible.rows[0].applied)
    await db.query(await readFile("database/migrations/20261025_garden_flexible.sql", "utf8"));
  await db.query("BEGIN");
  await db.query(
    "select pg_advisory_xact_lock(hashtextextended('roota-setup-garden',0))",
  );
  const {
    rows: [category],
  } = await db.query<{
    id: string;
  }>(`insert into categories(slug,name,sort_order)
    values('objects','Объекты',30) on conflict(slug) do update set slug=excluded.slug returning id`);
  const previous = await db.query(
    "select id,configurator from products where slug='sad'",
  );
  if (previous.rowCount && previous.rows[0].configurator !== "garden")
    throw new Error("SLUG_ALREADY_USED");
  let productId = previous.rows[0]?.id as string | undefined;
  if (!productId) {
    const {
      rows: [product],
    } = await db.query<{ id: string }>(
      `insert into products(category_id,slug,sku,name,description,price,stock_qty,product_kind,configurator,publication_status,
      preorder_enabled,lead_time_days,featured,featured_order,material,care,seo_title,seo_description)
      values($1,'sad','SAD','Сад',$2,2600,0,'batch','garden','published',true,21,true,0,'Глина, ангобы',$3,'Сад — керамический конструктор',
      'Соберите свой керамический сад из стеблей, цветочков и листочков. Четыре размера и свой состав. Изготовление — 3 недели после оплаты.') returning id`,
      [category.id, gardenDescription, gardenCare],
    );
    productId = product.id;
    for (let n = 1; n <= 5; n++) {
      const path = `/images/garden/garden-${n}.webp`;
      await db.query(
        `insert into product_images(product_id,storage_path,public_url,alt_text,sort_order,is_primary)
        values($1,$2,$2,$3,$4,$5)`,
        [
          productId,
          path,
          `Сад: керамический конструктор, фотография ${n}`,
          n - 1,
          n === 1,
        ],
      );
    }
  }
  for (const capacity of [6, 8, 12, 16, 24, 100]) {
    await db.query(
      `insert into delivery_packing_rules(name,composition,weight_g,length_mm,width_mm,height_mm,active,garden_size)
      select $1,$2::jsonb,$3,150,150,150,true,$4
      where not exists(select 1 from delivery_packing_rules where garden_size=$4)`,
      [
        `Сад · до ${capacity} деталей`,
        JSON.stringify([{ category_id: category.id, quantity: 1 }]),
        capacity * 65,
        capacity,
      ],
    );
  }
  // Respect subsequent editorial choices; only add the new product on first setup.
  if (!previous.rowCount) {
    for (const table of ["site_pages", "site_drafts"]) {
      await db.query(
        `update ${table} set payload=jsonb_set(payload,'{featuredIds}',
        coalesce(payload->'featuredIds','[]'::jsonb)||to_jsonb($1::text)) where id=1
        and jsonb_typeof(payload->'featuredIds')='array'
        and jsonb_array_length(payload->'featuredIds')<12
        and not (payload->'featuredIds' ? $1::text)`,
        [productId],
      );
    }
  }
  await db.query("COMMIT");
  console.log(
    "Garden ready: /product/sad; packing: 150×150×150 mm, 65 g per part (provisional). Existing orders unchanged.",
  );
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  db.release();
  await pool.end();
}
