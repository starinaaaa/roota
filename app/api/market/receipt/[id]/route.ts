import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import {
  adminRequest,
  json,
  marketError,
  marketHeaders,
} from "@/lib/market/http";
import { validReceiptUrl } from "@/lib/market/model";
import { qrLabelPdf, officialReceiptPdf } from "@/lib/market/pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await adminRequest()))
    return json({ error: "Войдите в управление студией" }, 401);
  try {
    const id = z.uuid().parse((await params).id);
    const {
      rows: [sale],
    } = await getPool().query(
      "select s.receipt_url,s.status from public.market_sales s join public.market_receipt_jobs j on j.sale_id=s.id where s.id=$1 and j.state='registered' and j.verified_at is not null",
      [id],
    );
    if (
      !sale ||
      sale.status !== "paid" ||
      !sale.receipt_url ||
      !validReceiptUrl(sale.receipt_url)
    )
      return json(
        { error: "Сначала добавьте ссылку на выданный чек ФНС" },
        404,
      );
    const label = new URL(request.url).searchParams.get("format") === "label";
    let bytes: Buffer;
    if (label) bytes = await qrLabelPdf(sale.receipt_url, "receipt");
    else {
      // Exact allowlisted public FNS URL. Never follow a redirect to another host.
      const result = await fetch(sale.receipt_url, {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!result.ok)
        throw new Error("Не удалось скачать чек ФНС. Проверьте ссылку");
      const reader = result.body?.getReader();
      if (!reader) throw new Error("Чек ФНС пуст");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Размер чека слишком большой");
        }
        chunks.push(value);
      }
      bytes = await officialReceiptPdf(
        Buffer.concat(chunks),
        result.headers.get("content-type") ?? "",
      );
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...marketHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="roota-receipt-${id}${label ? "-40x58" : ""}.pdf"`,
      },
    });
  } catch (e) {
    return marketError(e);
  }
}
