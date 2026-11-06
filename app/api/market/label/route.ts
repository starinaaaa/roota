import { adminRequest, marketHeaders, json } from "@/lib/market/http";
import { marketLinks } from "@/lib/market/server";
import { qrLabelPdf } from "@/lib/market/pdf";
export const runtime = "nodejs";
export async function GET() {
  if (!(await adminRequest()))
    return json({ error: "Войдите в управление студией" }, 401);
  const bytes = await qrLabelPdf((await marketLinks()).hello, "hello");
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...marketHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="roota-hello-40x58.pdf"',
    },
  });
}
