import "server-only";
import { getPool } from "./db/pool";
import type { returnReasons, requestStatuses } from "./delivery/return-model";
export type CustomerReturnRequest = {
  id: string;
  reason: keyof typeof returnReasons;
  description: string;
  status: keyof typeof requestStatuses;
  studio_reply: string;
  photos: string[];
  created_at: string;
};
export async function customerReturnState(orderId: string) {
  try {
    const { rows } = await getPool().query<CustomerReturnRequest>(
      `select id,reason,description,status,studio_reply,photos,created_at from customer_return_requests where order_id=$1 order by created_at desc`,
      [orderId],
    );
    return { available: true, requests: rows };
  } catch (error) {
    if ((error as { code?: string }).code === "42P01")
      return { available: false, requests: [] };
    throw new Error("Не удалось загрузить обращения по заказу.");
  }
}
