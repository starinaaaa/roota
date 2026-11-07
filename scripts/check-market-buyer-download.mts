import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  createSale,
  confirmManualSale,
  confirmSale,
  attachReceipt,
} from "../lib/market/store";
import { PDFDocument } from "pdf-lib";
const url = new URL(process.env.DATABASE_URL!);
const base = process.env.ROOTA_TEST_URL ?? "http://127.0.0.1:3163";
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  !["127.0.0.1", "localhost"].includes(new URL(base).hostname) ||
  url.pathname !== "/roota_npd_helper_preview"
)
  throw Error("LOCAL_FIXTURE_DATABASE_REQUIRED");
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
const ids: string[] = [];
let previous: string | null = null;
try {
  await db.query("BEGIN");
  previous = (
    await db.query(
      "select current_sale_id from market_register where id=1 for update",
    )
  ).rows[0].current_sale_id;
  await db.query("update market_register set current_sale_id=null where id=1");
  const add = async (method: "cash" | "robokassa" = "cash") => {
    const s = await createSale(
      db,
      {
        requestKey: randomUUID(),
        quantities: { postcard: 1 },
        gardenBundle: true,
      },
      "test",
      method,
    );
    ids.push(s.id);
    return s;
  };
  const ready = await add();
  await confirmManualSale(db, ready.id, "local-fixture");
  await attachReceipt(db, ready.id, {
    url: `https://lknpd.nalog.ru/api/v1/receipt/773212983545/roota-helper-local-fixture-${randomUUID()}/print`,
    registeredAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
  });
  const queued = await add();
  await confirmManualSale(db, queued.id, "local-fixture");
  const uncertain = await add();
  await confirmManualSale(db, uncertain.id, "local-fixture");
  await db.query(
    "update market_receipt_jobs set state='uncertain' where sale_id=$1",
    [uncertain.id],
  );
  const robo = await add("robokassa");
  await confirmSale(db, robo.id);
  const pending = await add();
  await db.query("COMMIT");
  const get = (token: string, path = "") =>
    fetch(base + "/api/market/pay/" + token + path);
  const doc = await get(ready.token, "/receipt");
  assert.equal(doc.status, 200);
  assert.match(doc.headers.get("content-type") ?? "", /application\/pdf/);
  assert.match(doc.headers.get("cache-control") ?? "", /private.*no-store/);
  assert.equal(
    (await PDFDocument.load(await doc.arrayBuffer())).getPageCount(),
    1,
  );
  for (const s of [queued, uncertain, robo, pending])
    assert.equal((await get(s.token, "/receipt")).status, 409);
  for (const token of ["invalid", "f".repeat(64)])
    assert.equal((await get(token, "/receipt")).status, 404);
  const publicSale = await (await get(ready.token)).json();
  assert.ok(publicSale.receiptUrl);
  assert.equal(publicSale.emailSaved, false);
  for (const k of ["email", "token", "allocations", "helpers"])
    assert.equal(k in publicSale, false);
  const notReady = await (await get(queued.token)).json();
  assert.equal(notReady.receiptUrl, null);
  assert.equal(notReady.receiptStatus, "queued");
  console.log(
    "PASS: actual public PDF, private/no-store headers, token isolation, pending/uncertain/Robokassa rejection and public data boundaries",
  );
} finally {
  await db.query("ROLLBACK");
  await db.query("BEGIN");
  await db.query("update market_register set current_sale_id=$1 where id=1", [
    previous,
  ]);
  await db.query(
    "delete from market_receipt_jobs where sale_id=any($1::uuid[])",
    [ids],
  );
  await db.query("delete from market_sales where id=any($1::uuid[])", [ids]);
  await db.query("COMMIT");
  await db.end();
}
