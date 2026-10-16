// Verifies one explicitly marked studio test, never exports other mail events.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { directory, pool, guardTarget } from "./common";
import { emailProviderKey } from "../../lib/email/provider-config";
const db = pool("TARGET_DATABASE_URL");
try {
  await guardTarget(db, false);
  const dir = await directory(process.argv[2]);
  const key = emailProviderKey("order_created", process.env);
  if (!key) throw Error("SERVICE_KEY_REQUIRED");
  const row = (
    await db.query(
      "select id,provider_job_id,created_at from email_messages where payload @> '{\"test\":true,\"studio\":true}'::jsonb and recipient='hello@roota.moscow' and state in ('accepted','delivered') and provider_job_id is not null and created_at>now()-interval '1 day' order by created_at desc limit 1",
    )
  ).rows[0];
  if (!row) throw Error("ACCEPTED_STUDIO_TEST_REQUIRED");
  async function api(method: string, body: unknown) {
    const response = await fetch(
      `https://goapi.unisender.ru/ru/transactional/api/v1/event-dump/${method}.json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": key! },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await response.json();
    if (!response.ok || data.status !== "success")
      throw Error("MAIL_AUDIT_API_REJECTED");
    return data;
  }
  const start = new Date(row.created_at.getTime() - 60000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const dumpFile = path.join(dir, "studio-email-dump.json");
  let previous;
  try {
    previous = JSON.parse(await readFile(dumpFile, "utf8"));
  } catch {}
  const created =
    previous?.jobId === row.provider_job_id
      ? previous
      : await api("create", {
          start_time: start,
          limit: 50,
          all_projects: false,
          filter: { job_id: row.provider_job_id },
          dump_fields: ["event_time", "job_id", "status", "delivery_status"],
          format: "csv",
        });
  await writeFile(
    dumpFile,
    JSON.stringify({ ...created, jobId: row.provider_job_id }),
    { mode: 0o600 },
  );
  let dump;
  for (let i = 0; i < 6; i++) {
    dump = (await api("get", { dump_id: created.dump_id })).event_dump;
    if (dump.dump_status === "ready") break;
    if (dump.dump_status === "failed") throw Error("MAIL_AUDIT_DUMP_FAILED");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!dump?.files?.length) throw Error("MAIL_AUDIT_NOT_READY");
  const events: string[] = [];
  for (const file of dump.files) {
    const url = new URL(file.url);
    if (
      url.protocol !== "https:" ||
      !(
        (url.hostname === "go2.unisender.ru" &&
          url.pathname.startsWith("/event-dump/")) ||
        (url.hostname === "go2.s3.unisender.ru" &&
          url.pathname.startsWith("/temporary/"))
      )
    )
      throw Error("MAIL_AUDIT_UNEXPECTED_URL");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok) throw Error("MAIL_AUDIT_DOWNLOAD_FAILED");
    const csv = await response.text();
    if (csv.length > 100000) throw Error("MAIL_AUDIT_TOO_LARGE");
    for (const line of csv.split(/\r?\n/).slice(1)) {
      const fields = line.split(",").map((x) => x.replace(/^"|"$/g, ""));
      if (
        fields[1] === row.provider_job_id &&
        ["delivered", "opened", "clicked"].includes(fields[2])
      )
        events.push(fields[2]);
    }
  }
  const delivered = events.length > 0;
  await writeFile(
    path.join(dir, "studio-email-delivery-verified.json"),
    JSON.stringify({
      verifiedAt: new Date().toISOString(),
      messageId: row.id,
      jobId: row.provider_job_id,
      delivered,
      events,
    }),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({ studioTest: true, providerDeliveryConfirmed: delivered }),
  );
  if (!delivered) process.exitCode = 1;
} catch (error) {
  console.error("STUDIO_EMAIL_VERIFICATION_FAILED", (error as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
