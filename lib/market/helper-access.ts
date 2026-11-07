import { randomBytes, timingSafeEqual } from "node:crypto";
import { tokenHash, lockRegister, type MarketDb } from "./store";
export type Helper = {
  id: string;
  name: string;
  extension_id: string;
  token_hash: string;
  revoked_at: Date | null;
  live_enabled: boolean;
  approved_sale_id: string | null;
  live_all_sales: boolean;
  operation_mode: "safe" | "live";
};
export async function createHelper(
  db: MarketDb,
  name: string,
  extensionId: string,
  actor: string,
) {
  await lockRegister(db);
  const secret = randomBytes(32).toString("hex");
  const {
    rows: [helper],
  } = await db.query<Helper>(
    `insert into public.market_receipt_helpers(name,extension_id,token_hash,created_by) values($1,$2,$3,$4) returning *`,
    [name, extensionId, tokenHash(secret), actor],
  );
  return { id: helper.id, token: `${helper.id}.${secret}` };
}
export async function authenticateHelper(
  db: MarketDb,
  authorization: string | null,
  origin: string | null,
) {
  const match = /^Bearer ([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(
    authorization ?? "",
  );
  if (!match) return null;
  const {
    rows: [helper],
  } = await db.query<Helper>(
    "select * from public.market_receipt_helpers where id=$1 and revoked_at is null",
    [match[1]],
  );
  if (
    !helper ||
    (origin && origin !== `chrome-extension://${helper.extension_id}`)
  )
    return null;
  const expected = Buffer.from(helper.token_hash),
    provided = Buffer.from(tokenHash(match[2]));
  return expected.length === provided.length &&
    timingSafeEqual(expected, provided)
    ? helper
    : null;
}
export async function revokeHelper(db: MarketDb, id: string) {
  await lockRegister(db);
  await db.query(
    "update public.market_receipt_helpers set revoked_at=coalesce(revoked_at,now()),live_enabled=false,status='offline' where id=$1",
    [id],
  );
  // Never release a task after submission: its result must be reconciled.
  await db.query(
    "update public.market_receipt_jobs set state='queued',claim_token=null,helper_id=null,lease_until=null where helper_id=$1 and state='claimed'",
    [id],
  );
  await db.query(
    "update public.market_receipt_jobs set state='uncertain',last_error='Доступ помощника отозван после начала отправки. Сверьте доход в ФНС.' where helper_id=$1 and state='submitting'",
    [id],
  );
}
