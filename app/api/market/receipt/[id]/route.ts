import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import {
  adminRequest,
  json,
  marketError,
  marketHeaders,
} from "@/lib/market/http";
import { validReceiptUrl } from "@/lib/market/model";
import { qrLabelPdf } from "@/lib/market/pdf";
import { fetchReceiptPdf } from "@/lib/market/verify-receipt";
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
      bytes = await fetchReceiptPdf(sale.receipt_url);
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
