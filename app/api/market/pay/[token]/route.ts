import { z } from "zod";
import { preparePayment, publicSale, saleByToken } from "@/lib/market/server";
import { json, marketError, readMarketBody } from "@/lib/market/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { token } = await context.params;
    const sale = await saleByToken(token);
    if (!sale) return json({ error: "Покупка не найдена" }, 404);
    return json({ ...publicSale(sale), paymentUrl: null, qr: null });
  } catch (e) {
    return marketError(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const { token } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(token))
      return json({ error: "Покупка не найдена" }, 404);
    const input = z
      .object({ email: z.email().max(254), accepted: z.literal(true) })
      .strict()
      .parse(await readMarketBody(request));
    return json({
      form: await preparePayment(token, input.email.trim().toLowerCase()),
    });
  } catch (e) {
    return marketError(e);
  }
}
