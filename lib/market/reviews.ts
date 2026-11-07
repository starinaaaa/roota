import type { MarketDb } from "./store";
import { reviewSchema } from "../reviews";
import { phone } from "../validation";
import { z } from "zod";
export const marketReviewSchema = reviewSchema
  .extend({
    phone,
    publicationConsent: z.boolean(),
    accepted: z.literal(true),
  })
  .strict();
export async function marketReviewState(db: MarketDb, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const {
    rows: [sale],
  } = await db.query(
    `select s.id,s.inv_id,s.items,r.id review_id,r.publication_consent,
  reward.code,reward.expires_at,reward.redeemed_at,reward.revoked_at,reward.reserved_order_id
  from public.market_sales s left join public.customer_reviews r on r.market_sale_id=s.id
  left join public.review_rewards reward on reward.source_market_sale_id=s.id
  where s.review_token=$1 and s.mode='live' and s.status='paid'`,
    [token],
  );
  if (!sale) return null;
  return {
    number: `М-${String(sale.inv_id).slice(-6)}`,
    items: sale.items,
    saved: !!sale.review_id,
    publicationConsent: sale.publication_consent ?? false,
    reward: sale.code
      ? {
          code: sale.code,
          expiresAt: new Date(sale.expires_at).toISOString(),
          available:
            !sale.redeemed_at &&
            !sale.revoked_at &&
            !sale.reserved_order_id &&
            new Date(sale.expires_at) > new Date(),
        }
      : null,
  };
}
export async function submitMarketReview(
  db: MarketDb,
  token: string,
  raw: unknown,
) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("Проверьте персональную ссылку из письма");
  const input = marketReviewSchema.parse(raw);
  await db.query("select public.submit_market_review($1,$2,$3,$4,$5,$6)", [
    token,
    input.rating,
    input.body,
    input.publicationConsent,
    input.displayName,
    input.phone,
  ]);
  return marketReviewState(db, token);
}
