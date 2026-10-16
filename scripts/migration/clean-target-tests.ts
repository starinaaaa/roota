// Removes only disposable staging records, while preserving catalogue and auth.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pool, guardTarget, directory } from "./common";
import { emptyTables } from "./policy";
const db = pool("TARGET_DATABASE_URL");
let begun = false;
try {
  await guardTarget(db, false);
  const dir = await directory(process.argv[2]);
  if (
    process.env.APP_ENV !== "migration" ||
    process.env.MIGRATION_MAINTENANCE !== "true" ||
    process.env.JOBS_ENABLED === "true"
  )
    throw Error("MAINTENANCE_REQUIRED");
  const probe = await fetch(
    "https://starinaaaa-roota-stand-5005.twc1.net/checkout",
    { redirect: "error", signal: AbortSignal.timeout(15000) },
  );
  if (probe.status !== 503) throw Error("STAGING_WRITES_STILL_OPEN");
  await db.query("BEGIN");
  begun = true;
  const live = (
    await db.query(
      "select exists(select 1 from orders) or exists(select 1 from payments where mode='live') present",
    )
  ).rows[0].present;
  if (live) throw Error("NON_DEMO_RECORDS_PRESENT");
  const floor = (
    await db.query("select last_value::text n from robokassa_inv_id")
  ).rows[0].n;
  await db.query(
    "TRUNCATE " + emptyTables.map((t) => 'public."' + t + '"').join(","),
  );
  for (const table of emptyTables)
    if (
      (await db.query(`select exists(select 1 from public."${table}") present`))
        .rows[0].present
    )
      throw Error("TARGET_NOT_EMPTY");
  const next = (
    await db.query("select last_value::text n from robokassa_inv_id")
  ).rows[0].n;
  if (BigInt(next) < BigInt(floor)) throw Error("INVOICE_HIGH_WATER_LOST");
  await db.query("COMMIT");
  begun = false;
  const proof = {
    cleanedAt: new Date().toISOString(),
    verifiedEmptyTables: emptyTables.length,
    invoiceFloor: next,
    authPreserved: true,
  };
  await writeFile(
    path.join(dir, "target-clean-verified.json"),
    JSON.stringify(proof),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(proof));
} catch (error) {
  if (begun) await db.query("ROLLBACK");
  console.error("TARGET_TEST_CLEANUP_FAILED", (error as Error).name);
  process.exitCode = 1;
} finally {
  await db.end();
}
