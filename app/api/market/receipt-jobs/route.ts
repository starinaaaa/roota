import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getPool, transaction } from "@/lib/db/pool";
import { json, marketError } from "@/lib/market/http";
import { claimReceiptJob, receiptJobAction } from "@/lib/market/receipt-jobs";
import { verifyReceipt } from "@/lib/market/verify-receipt";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("claim"),
      worker: z.string().min(1).max(100),
      mode: z.enum(["test", "live"]),
    })
    .strict(),
  z
    .object({
      action: z.enum(["submit", "error", "result"]),
      id: z.uuid(),
      token: z.string().regex(/^[a-f0-9]{64}$/),
      url: z.string().max(2048).optional(),
      registeredAt: z.iso.datetime().optional(),
      error: z.string().min(1).max(500).optional(),
      uncertain: z.boolean().optional(),
    })
    .strict(),
]);
export async function POST(request: Request) {
  const secret = process.env.MARKET_RECEIPT_HELPER_TOKEN;
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    return json({ error: "Нет доступа" }, 401);
  try {
    // Local helper uses a scoped bearer token, not browser cookies; no cross-origin browser calls.
    if (request.headers.has("origin"))
      return json({ error: "Недопустимый запрос" }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new Error("Нужен JSON");
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Пустой запрос");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) {
        await reader.cancel();
        throw new Error("Слишком большой запрос");
      }
      chunks.push(value);
    }
    const body = schema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    if (body.action === "claim")
      return json({
        job: await transaction((db) =>
          claimReceiptJob(db, body.worker, body.mode),
        ),
      });
    const {
      rows: [existing],
    } = await getPool().query(
      "select j.state,j.claim_token,s.receipt_url from public.market_receipt_jobs j join public.market_sales s on s.id=j.sale_id where j.sale_id=$1",
      [body.id],
    );
    if (!existing || existing.claim_token !== body.token)
      return json({ error: "Задача захвачена другим исполнителем" }, 409);
    if (existing.state === "registered" && body.action === "result") {
      if (
        body.url?.replace(/\/$/, "") !==
        existing.receipt_url?.replace(/\/$/, "")
      )
        return json({ error: "К покупке уже привязан другой чек" }, 409);
      return json({ state: "registered" });
    }
    const proof =
      body.action === "result"
        ? await verifyReceipt(
            z.string().parse(body.url),
            z.iso.datetime().parse(body.registeredAt),
          )
        : undefined;
    if (body.action === "error" && !body.error)
      throw new Error("Укажите причину ошибки");
    return json(
      await transaction((db) =>
        receiptJobAction(db, body.id, body.token, body.action, {
          ...body,
          proof,
        }),
      ),
    );
  } catch (e) {
    return marketError(e);
  }
}
