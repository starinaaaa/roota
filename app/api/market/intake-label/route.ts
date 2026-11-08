import { adminRequest, json, marketHeaders } from "@/lib/market/http";
import { qrLabelPdf } from "@/lib/market/pdf";
import { siteUrl } from "@/lib/seo";
export const runtime = "nodejs";
export async function GET() {
  if (!(await adminRequest()))
    return json({ error: "Войдите в управление студией" }, 401);
  const bytes = await qrLabelPdf(siteUrl("/market/buy"), "market");
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...marketHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'attachment; filename="roota-market-buy-40x58.pdf"',
    },
  });
}
