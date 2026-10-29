import "server-only";
import { getPool } from "@/lib/db/pool";
import type { ReturnEvent } from "./return-model";
export type StoredCarrierReturn = {
  return_number: string;
  order_id: string | null;
  order_number?: string | null;
  status: string;
  status_changed_at: string;
  current_placement_name: string | null;
  current_placement_address: string | null;
  cancellation_reason: string | null;
  history: ReturnEvent[];
  history_error: boolean;
  synced_at: string;
};
export async function orderCarrierReturns(
  orderId: string,
): Promise<StoredCarrierReturn[]> {
  try {
    return (
      await getPool().query<StoredCarrierReturn>(
        `select * from delivery_returns where order_id=$1 order by status_changed_at desc`,
        [orderId],
      )
    ).rows;
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error("Не удалось загрузить возвратные отправления.");
  }
}

export async function returnAttentionItems() {
  const { requireAdmin } = await import("@/lib/auth");
  await requireAdmin();
  try {
    return (
      await getPool().query<{
        id: string;
        title: string;
        detail: string;
        href: string;
      }>(`
      select r.id::text,'Заявка на возврат' title,o.order_number detail,'/admin/returns' href
      from customer_return_requests r join orders o on o.id=r.order_id where r.status in ('new','reviewing')
      union all select return_number,'Проверьте возврат Ozon',
       coalesce(current_placement_address,current_placement_name,return_number),'/admin/returns'
      from delivery_returns where status not in ('moving','received')
      union all select 'ozon-return-sync','Ошибка проверки возвратов',last_error,'/admin/returns'
      from delivery_return_sync where last_error is not null
      limit 100`)
    ).rows;
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error("Не удалось проверить обращения и возвраты.");
  }
}
