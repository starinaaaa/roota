// Explicitly simulated notification delivery, never a claim of provider delivery.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pool, guardTarget, directory } from "./common";
import { verifyPaymentNotification } from "../../lib/payments/model";
const db = pool("TARGET_DATABASE_URL");
try {
  await guardTarget(db, false);
  const dir = await directory(process.argv[2]);
  const id = process.argv[3];
  if (!/^[a-f0-9-]{36}$/.test(id ?? ""))
    throw Error("TEST_PAYMENT_UUID_REQUIRED");
  const origin = "https://starinaaaa-roota-stand-5005.twc1.net";
  if (
    process.env.APP_ENV !== "migration" ||
    process.env.ROBOKASSA_MODE !== "test" ||
    process.env.ROBOKASSA_LIVE_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_SITE_URL !== origin
  )
    throw Error("ISOLATED_TEST_ENVIRONMENT_REQUIRED");
  const pay = (
    await db.query(
      "select * from payments where id=$1 and mode='test' and order_id is null and created_at>now()-interval '1 hour'",
      [id],
    )
  ).rows[0];
  if (!pay) throw Error("RECENT_TEST_PAYMENT_REQUIRED");
  const algorithm = process.env.ROBOKASSA_HASH_ALGORITHM;
  const key = process.env.ROBOKASSA_TEST_PASSWORD2;
  if (!key || !["md5", "sha256", "sha512"].includes(algorithm ?? ""))
    throw Error("TEST_PAYMENT_CONFIG_REQUIRED");
  const fields = {
    OutSum: String(pay.amount),
    InvId: String(pay.inv_id),
    Shp_mode: "test",
    Shp_payment: pay.id,
    SignatureValue: createHash(algorithm!)
      .update(
        `${pay.amount}:${pay.inv_id}:${key}:Shp_mode=test:Shp_payment=${pay.id}`,
      )
      .digest("hex"),
  };
  verifyPaymentNotification(pay, fields);
  async function send(body: Record<string, string>) {
    const r = await fetch(origin + "/api/payments/robokassa/result", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    return { status: r.status, body: await r.text() };
  }
  const invalid = await send({
    ...fields,
    SignatureValue: "0".repeat(fields.SignatureValue.length),
  });
  if (invalid.status !== 400) throw Error("INVALID_SIGNATURE_ACCEPTED");
  const before = (
    await db.query("select status,paid_at from payments where id=$1", [id])
  ).rows[0];
  const first = await send(fields);
  const after = (
    await db.query("select status,paid_at from payments where id=$1", [id])
  ).rows[0];
  const replay = await send(fields);
  const repeated = (
    await db.query("select status,paid_at from payments where id=$1", [id])
  ).rows[0];
  if (
    first.status !== 200 ||
    replay.status !== 200 ||
    first.body !== `OK${pay.inv_id}` ||
    replay.body !== first.body ||
    after.status !== "paid" ||
    !after.paid_at ||
    after.paid_at.toISOString() !== repeated.paid_at?.toISOString()
  )
    throw Error("TEST_CALLBACK_IDEMPOTENCY_FAILED");
  const proof = {
    verifiedAt: new Date().toISOString(),
    simulatedDelivery: true,
    providerDeliveryVerified: false,
    mode: "test",
    paymentId: id,
    invoice: String(pay.inv_id),
    previousState: before.status,
    invalidSignatureRejected: true,
    paid: true,
    replayIdempotent: true,
  };
  await writeFile(
    path.join(dir, "test-payment-callback-verified.json"),
    JSON.stringify(proof),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(proof));
} catch (error) {
  console.error("TEST_PAYMENT_REPLAY_FAILED", (error as Error).name);
  process.exitCode = 1;
} finally {
  await db.end();
}
