import { randomBytes } from "node:crypto";
import type { MarketDb } from "./store";
import { attachReceipt, lockRegister } from "./store";

type Job = {
  sale_id: string;
  state: string;
  claim_token: string;
  lease_until: Date;
  items: unknown;
  amount: string;
  paid_at: Date;
  mode: string;
};

/** Claim leases may expire only before submission. A lost FNS response is never retried automatically. */
export async function claimReceiptJob(
  db: MarketDb,
  worker: string,
  mode: "test" | "live",
) {
  await lockRegister(db);
  await db.query(`update public.market_receipt_jobs set state='uncertain',last_error='Нет подтверждения результата. Сверьте доход в Моем налоге.',updated_at=now()
    where state='submitting' and lease_until<=now()`);
  const {
    rows: [job],
  } = await db.query<Job>(
    `select j.*,s.items,s.amount,s.paid_at,s.mode,s.payment_method from public.market_receipt_jobs j
    join public.market_sales s on s.id=j.sale_id where s.mode=$1 and s.status='paid' and s.payment_method<>'robokassa'
    and (j.state='queued' or (j.state='claimed' and j.lease_until<=now()))
    order by j.created_at,j.sale_id for update of j skip locked limit 1`,
    [mode],
  );
  if (!job) return null;
  const token = randomBytes(32).toString("hex");
  await db.query(
    `update public.market_receipt_jobs set state='claimed',claim_token=$2,worker=$3,
    lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now() where sale_id=$1`,
    [job.sale_id, token, worker],
  );
  return {
    ...job,
    state: "claimed",
    claim_token: token,
    leaseSeconds: 300,
    idempotencyKey: `market:${job.sale_id}`,
  };
}
export async function receiptJobAction(
  db: MarketDb,
  id: string,
  token: string,
  action: "submit" | "error" | "result",
  data: {
    error?: string;
    uncertain?: boolean;
    proof?: { url: string; registeredAt: string; verifiedAt: string };
  },
) {
  await lockRegister(db);
  const {
    rows: [job],
  } = await db.query<Job>(
    "select * from public.market_receipt_jobs where sale_id=$1 for update",
    [id],
  );
  if (!job || job.claim_token !== token)
    throw new Error("Задача захвачена другим исполнителем");
  if (action === "result") {
    if (
      !data.proof ||
      !["submitting", "uncertain", "registered"].includes(job.state)
    )
      throw new Error("Сначала зафиксируйте отправку чека");
    await attachReceipt(db, id, data.proof);
    return { state: "registered" };
  }
  if (action === "submit") {
    // Repeating submit MUST NOT grant permission to submit to FNS again.
    if (job.state !== "claimed" || new Date(job.lease_until) <= new Date())
      throw new Error(
        "Отправка уже начата или захват истёк. Сверьте результат",
      );
    await db.query(
      "update public.market_receipt_jobs set state='submitting',lease_until=now()+interval '5 minutes',updated_at=now() where sale_id=$1",
      [id],
    );
    return { state: "submitting", maySubmit: true };
  }
  if (job.state === "registered") return { state: "registered" };
  if (!["claimed", "submitting", "uncertain", "failed"].includes(job.state))
    throw new Error("Недопустимое состояние задачи");
  const state =
    job.state === "submitting" || job.state === "uncertain" || data.uncertain
      ? "uncertain"
      : "failed";
  await db.query(
    "update public.market_receipt_jobs set state=$2,last_error=$3,updated_at=now() where sale_id=$1",
    [id, state, data.error],
  );
  return { state };
}
