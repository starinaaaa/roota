import { transaction } from "@/lib/db/pool";
import { saveManualContact } from "@/lib/market/store";
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
    return json({
      ...publicSale(sale),
      paymentUrl: null,
      qr: null,
      emailSaved: Boolean(sale.email),
      marketingConsent: !!(sale as typeof sale & { marketing_consent: boolean })
        .marketing_consent,
      receiptEmailState: sale.receipt_email_state ?? null,
    });
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
      .object({
        email: z.email().max(254).optional(),
        accepted: z.literal(true),
        marketingConsent: z.boolean().default(false),
        reviewConsent: z.boolean().optional(),
      })
      .strict()
      .parse(await readMarketBody(request));
    const sale = await saleByToken(token);
    if (!sale) return json({ error: "Покупка не найдена" }, 404);
    const email = input.email?.trim().toLowerCase() || sale.email;
    if (!email) throw new Error("Укажите email для чека");
    await transaction(async (db) => {
      await db.query(
        "update market_sales set purchase_terms_version=coalesce(purchase_terms_version,'2026-10-24'),purchase_terms_accepted_at=coalesce(purchase_terms_accepted_at,now()) where id=$1",
        [sale.id],
      );
    });
    if (sale.payment_method !== "robokassa") {
      await transaction((db) =>
        saveManualContact(
          db,
          token,
          email,
          input.marketingConsent,
          input.reviewConsent ?? true,
        ),
      );
      return json({ saved: true });
    }
    return json({
      form: await preparePayment(
        token,
        email,
        input.marketingConsent,
        input.reviewConsent ?? true,
      ),
    });
  } catch (e) {
    return marketError(e);
  }
}
