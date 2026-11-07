import { z } from "zod";
import { getPool, transaction } from "@/lib/db/pool";
import { json, marketError } from "@/lib/market/http";
import { authenticateHelper } from "@/lib/market/helper-access";
import { claimReceiptJob, receiptJobAction } from "@/lib/market/receipt-jobs";
import { lockRegister } from "@/lib/market/store";
import { verifyReceipt } from "@/lib/market/verify-receipt";
import { receiptPlan, planDigest } from "@/extensions/roota-npd/core.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z
  .object({
    action: z.enum([
      "heartbeat",
      "claim",
      "recover",
      "preview",
      "submit",
      "result",
      "error",
      "release",
    ]),
    mode: z.enum(["test", "live"]).default("test"),
    safe: z.boolean().default(true),
    status: z
      .enum([
        "connected",
        "login_required",
        "busy",
        "error",
        "uncertain",
        "preview_ready",
      ])
      .optional(),
    detail: z.string().max(500).optional(),
    id: z.uuid().optional(),
    token: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    digest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    url: z.string().max(2048).optional(),
    registeredAt: z.iso.datetime().optional(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    const helper = await authenticateHelper(
      getPool(),
      request.headers.get("authorization"),
      request.headers.get("origin"),
    );
    if (!helper)
      return json({ error: "Доступ помощника отозван или не настроен" }, 401);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return json({ error: "Нужен JSON" }, 415);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Пустой запрос" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) {
        await reader.cancel();
        return json({ error: "Слишком большой запрос" }, 413);
      }
      chunks.push(value);
    }
    const body = schema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    // Recheck revocation under the same lock used by device revocation and task claims.
    const liveAllowed =
      process.env.MARKET_RECEIPT_LIVE_ENABLED === "true" &&
      helper.live_enabled &&
      !!(helper.approved_sale_id || helper.live_all_sales);
    if (body.action === "heartbeat") {
      await getPool().query(
        `update public.market_receipt_helpers set last_seen_at=now(),status=$2,detail=$3,operation_mode=$4 where id=$1 and revoked_at is null`,
        [
          helper.id,
          body.status ?? "connected",
          body.detail ?? null,
          body.safe ? "safe" : "live",
        ],
      );
      return json({ connected: true, liveAllowed });
    }
    const ownedSql = `select j.*,s.items,s.amount,s.paid_at,s.mode,s.payment_method,s.receipt_url from public.market_receipt_jobs j join public.market_sales s on s.id=j.sale_id where j.helper_id=$1`;
    if (body.action === "claim" || body.action === "recover") {
      return json(
        await transaction(async (db) => {
          await lockRegister(db);
          const {
            rows: [currentHelper],
          } = await db.query(
            "select revoked_at,live_enabled,approved_sale_id,live_all_sales from public.market_receipt_helpers where id=$1",
            [helper.id],
          );
          if (!currentHelper || currentHelper.revoked_at)
            throw new Error("Доступ отозван");
          const {
            rows: [existing],
          } = await db.query(
            ownedSql +
              " and j.state in ('claimed','submitting','uncertain','failed') order by j.created_at limit 1",
            [helper.id],
          );
          if (existing || body.action === "recover")
            return { job: existing ?? null, liveAllowed };
          if (
            !body.safe &&
            (!liveAllowed ||
              !currentHelper.live_enabled ||
              (!currentHelper.live_all_sales &&
                !currentHelper.approved_sale_id) ||
              body.mode !== "live")
          )
            throw new Error(
              "Рабочая выдача заблокирована. Доступен безопасный режим",
            );
          return {
            job: await claimReceiptJob(db, helper.name, body.mode, {
              helperId: helper.id,
              safe: body.safe,
              allowedSaleId:
                !body.safe && !currentHelper.live_all_sales
                  ? currentHelper.approved_sale_id
                  : null,
            }),
            liveAllowed,
          };
        }),
      );
    }
    const id = z.uuid().parse(body.id),
      token = z.string().parse(body.token);
    const {
      rows: [job],
    } = await getPool().query(ownedSql + " and j.sale_id=$2", [helper.id, id]);
    if (!job || job.claim_token !== token)
      return json(
        { error: "Захват задачи изменился. Отправка запрещена" },
        409,
      );
    if (body.action === "result" && job.state === "registered")
      return job.receipt_url?.replace(/\/$/, "") ===
        body.url?.replace(/\/$/, "")
        ? json({ state: "registered" })
        : json({ error: "К покупке уже привязан другой чек" }, 409);
    const digest = await planDigest(receiptPlan(job));
    if (
      ["preview", "submit", "result"].includes(body.action) &&
      body.digest !== digest
    )
      return json(
        { error: "Снимок покупки не совпадает с проверенной формой" },
        409,
      );
    // Verification performs only a public document GET; no FNS session data crosses this boundary.
    const proof =
      body.action === "result"
        ? await verifyReceipt(
            z.string().parse(body.url),
            z.iso.datetime().parse(body.registeredAt),
          )
        : undefined;
    return json(
      await transaction(async (db) => {
        await lockRegister(db);
        const {
          rows: [currentHelper],
        } = await db.query(
          "select revoked_at,live_enabled,approved_sale_id,live_all_sales from public.market_receipt_helpers where id=$1",
          [helper.id],
        );
        if (!currentHelper || currentHelper.revoked_at)
          throw new Error("Доступ отозван");
        const {
          rows: [current],
        } = await db.query(
          "select * from public.market_receipt_jobs where sale_id=$1 for update",
          [id],
        );
        if (current.helper_id !== helper.id || current.claim_token !== token)
          throw new Error("Захват задачи изменился");
        if (body.action === "preview" || body.action === "release") {
          if (!["claimed", "failed"].includes(current.state))
            throw new Error("После отправки задачу нельзя вернуть в очередь");
          if (body.action === "preview" && current.operation_mode !== "safe")
            throw new Error("Неверный режим задачи");
          await db.query(
            `update public.market_receipt_jobs set state='queued',lease_until=null,claim_token=null,helper_id=null,
      previewed_at=case when $2 then now() else previewed_at end,preview_digest=case when $2 then $3 else preview_digest end,updated_at=now() where sale_id=$1`,
            [id, body.action === "preview", digest],
          );
          return {
            state: body.action === "preview" ? "preview_ready" : "queued",
          };
        }
        if (
          body.action === "submit" &&
          (!liveAllowed ||
            !currentHelper.live_enabled ||
            (!currentHelper.live_all_sales &&
              !currentHelper.approved_sale_id) ||
            current.operation_mode !== "live" ||
            (!currentHelper.live_all_sales &&
              currentHelper.approved_sale_id !== id) ||
            job.mode !== "live")
        )
          throw new Error("Рабочая выдача не включена");
        return receiptJobAction(
          db,
          id,
          token,
          body.action as "submit" | "result" | "error",
          {
            proof,
            error:
              body.detail ?? "Помощник остановлен; требуется проверка продавца",
            uncertain: body.status === "uncertain",
          },
        );
      }),
    );
  } catch (e) {
    return marketError(e);
  }
}
