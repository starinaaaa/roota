import "server-only";
import { cache } from "react";
import type { QueryResultRow } from "pg";
import { getPool } from "./db/pool";
export const isPrivateReview = () => Boolean(process.env.ROOTA_REVIEW_HOST);
export const reviewHasTable = cache(async (table: string) => {
  if (!isPrivateReview()) return true;
  return Boolean(
    (
      await getPool().query("select to_regclass($1) is not null present", [
        `public.${table}`,
      ])
    ).rows[0].present,
  );
});
export async function reviewHasColumn(table: string, column: string) {
  if (!isPrivateReview()) return true;
  return Boolean(
    (
      await getPool().query(
        "select exists(select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2) present",
        [table, column],
      )
    ).rows[0].present,
  );
}
export async function reviewQuery<T extends QueryResultRow = QueryResultRow>(
  table: string,
  sql: string,
  params?: unknown[],
) {
  if (!(await reviewHasTable(table))) return { rows: [] as T[] };
  return getPool().query<T>(sql, params);
}
export async function productionTasksSource() {
  if (await reviewHasTable("production_tasks"))
    return "public.production_tasks";
  // Derive the view from existing paid orders. No table, dates or stages are saved.
  return `(select i.id,i.id order_item_id,((p.paid_at at time zone 'Europe/Moscow')::date+i.lead_time_days) ready_on,
    case when o.status='confirmed' then 'ready' when o.status='in_production' then 'forming' else 'queued' end stage,
    'План и этапы станут редактируемыми после одобрения миграции'::text next_action,o.updated_at
    from public.order_items i join public.orders o on o.id=i.order_id
    left join lateral(select min(paid_at) paid_at from public.payments where order_id=o.id and status='paid') p on true
    where i.purchase_mode='preorder' and o.payment_status='paid')`;
}
