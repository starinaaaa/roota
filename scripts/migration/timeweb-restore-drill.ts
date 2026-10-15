import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { directory, guardTarget, pool } from "./common";
import { transferTables } from "./policy";

// Run only against the isolated target, with the preview stopped. Restore the
// provider's physical backup in its panel between prepare and verify.
const [mode, folder] = process.argv.slice(2);
if (mode !== "prepare" && mode !== "verify")
  throw Error("USE_PREPARE_OR_VERIFY");
const dir = await directory(folder);
const file = path.join(dir, "timeweb-restore-drill.json");
const db = pool("TARGET_DATABASE_URL");
type Proof = {
  version: 1;
  invoiceHighWater: string;
  fingerprints: Record<string, string>;
  preparedAt: string;
  verifiedAt?: string;
};
try {
  await guardTarget(db);
  if (
    (
      await db.query(
        "select exists(select 1 from orders) or exists(select 1 from payments where mode <> 'test') unsafe",
      )
    ).rows[0].unsafe
  )
    throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
  if (mode === "prepare") {
    const fingerprints: Record<string, string> = {};
    for (const table of transferTables) {
      fingerprints[table] = (
        await db.query(
          `select md5(coalesce(string_agg(digest, '' order by digest), '')) value from (select md5(to_jsonb(t)::text) digest from public."${table}" t) s`,
        )
      ).rows[0].value;
    }
    const proof: Proof = {
      version: 1,
      preparedAt: new Date().toISOString(),
      fingerprints,
      invoiceHighWater: (
        await db.query("select last_value::text n from robokassa_inv_id")
      ).rows[0].n,
    };
    await writeFile(file, JSON.stringify(proof), { mode: 0o600, flag: "wx" });
    await db.query(
      "create table public.roota_restore_probe (id uuid primary key)",
    );
    await db.query("insert into public.roota_restore_probe values($1)", [
      randomUUID(),
    ]);
    console.log("RESTORE_PROBE_PREPARED");
  } else {
    const proof: Proof = JSON.parse(await readFile(file, "utf8"));
    if (
      proof.version !== 1 ||
      JSON.stringify(Object.keys(proof.fingerprints)) !==
        JSON.stringify(transferTables)
    )
      throw Error("INVALID_RESTORE_PROOF");
    // Always raise the sequence before other checks: restoring a physical copy
    // must never reuse an invoice already presented to the payment provider.
    await db.query(
      "select setval('robokassa_inv_id', greatest((select last_value from robokassa_inv_id),$1::bigint),true)",
      [proof.invoiceHighWater],
    );
    if (
      (
        await db.query(
          "select to_regclass('public.roota_restore_probe') present",
        )
      ).rows[0].present
    )
      throw Error("BACKUP_NOT_RESTORED");
    for (const table of transferTables) {
      const value = (
        await db.query(
          `select md5(coalesce(string_agg(digest, '' order by digest), '')) value from (select md5(to_jsonb(t)::text) digest from public."${table}" t) s`,
        )
      ).rows[0].value;
      if (value !== proof.fingerprints[table])
        throw Error(`RESTORE_MISMATCH_${table}`);
    }
    proof.verifiedAt = new Date().toISOString();
    await writeFile(file, JSON.stringify(proof), { mode: 0o600 });
    console.log(
      JSON.stringify({
        restored: true,
        verifiedTables: transferTables.length,
        invoiceSequenceSafe: true,
      }),
    );
  }
} finally {
  await db.end();
}
