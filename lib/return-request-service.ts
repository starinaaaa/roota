import { returnRequestSchema } from "./delivery/return-model";
import type { ReturnDatabase } from "./delivery/returns-sync-core";

export const receivedOrderSelection = `select id from orders where id=$1 and payment_status='paid'
 and (status='delivered' or delivery_stage='delivered' or exists(
  select 1 from order_shipments s cross join lateral jsonb_array_elements(coalesce(s.status_history->'postings','[]'::jsonb)) p
  where s.order_id=orders.id and p->>'status'='delivered'))`;

// Caller supplies an authenticated order and a transaction. No carrier or payment API.
export async function saveReturnApplication(
  db: ReturnDatabase,
  orderId: string,
  input: { reason: string; description: string; photos: string[] },
) {
  const data = returnRequestSchema.parse(input);
  if (
    input.photos.length > 3 ||
    input.photos.some(
      (path) =>
        !path.startsWith(`${orderId}/`) ||
        !/^[a-f0-9-]+\/[a-f0-9-]+\.jpg$/.test(path),
    )
  )
    throw new Error("INVALID_PHOTO_PATH");
  if (data.reason !== "other" && !input.photos.length)
    throw new Error("PHOTO_REQUIRED");
  const eligible = await db.query(`${receivedOrderSelection} for update`, [
    orderId,
  ]);
  if (!eligible.rows.length) throw new Error("ORDER_NOT_ELIGIBLE");
  const attempts = await db.query(
    `select count(*)::int as count from customer_return_requests
    where order_id=$1 and created_at>now()-interval '30 days'`,
    [orderId],
  );
  if (Number(attempts.rows[0].count) >= 3) throw new Error("TOO_MANY_REQUESTS");
  await db.query(
    `insert into customer_return_requests(order_id,reason,description,photos) values($1,$2,$3,$4)`,
    [orderId, data.reason, data.description, JSON.stringify(input.photos)],
  );
}
