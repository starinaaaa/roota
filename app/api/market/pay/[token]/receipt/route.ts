import { saleByToken, publicSale } from "@/lib/market/server";
import { json, marketError, marketHeaders } from "@/lib/market/http";
import { fetchReceiptPdf } from "@/lib/market/verify-receipt";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const sale = await saleByToken(token);
    if (!sale) return json({ error: "Покупка не найдена" }, 404);
    const url = publicSale(sale).receiptUrl;
    if (sale.status !== "paid" || sale.payment_method === "robokassa" || !url)
      return json(
        {
          error: "Чек ещё не подтверждён. Его можно будет скачать после выдачи",
        },
        409,
      );
    const pdf = await fetchReceiptPdf(url);
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...marketHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="roota-receipt.pdf"',
      },
    });
  } catch (error) {
    return marketError(error);
  }
}
