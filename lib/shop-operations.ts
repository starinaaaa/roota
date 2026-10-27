import "server-only";
import { productionTasksSource } from "./review-schema";
import { requireAdmin } from "./auth";
import { getPool } from "./db/pool";
import type { GardenConfiguration } from "./garden";
import type { productionStages } from "./production";
export type ProductionTask = {
  id: string;
  order_id: string;
  order_number: string;
  product_name: string;
  quantity: number;
  ready_on: string | null;
  stage: keyof typeof productionStages;
  next_action: string;
  configuration: GardenConfiguration | null;
  overdue: boolean;
};
export async function productionQueue() {
  await requireAdmin();
  const source = await productionTasksSource();
  return (
    await getPool()
      .query<ProductionTask>(`select t.id,i.order_id,o.order_number,i.product_name,i.quantity,to_char(t.ready_on,'YYYY-MM-DD') ready_on,t.stage,t.next_action,i.configuration,
   (t.ready_on<(now() at time zone 'Europe/Moscow')::date and t.stage<>'ready') overdue
   from ${source} t join public.order_items i on i.id=t.order_item_id join public.orders o on o.id=i.order_id
   where o.payment_status='paid' and o.status not in ('cancelled','shipped','delivered')
   order by t.ready_on nulls first,o.created_at,t.id`)
  ).rows;
}
export async function attentionItems() {
  await requireAdmin();
  const source = await productionTasksSource();
  return (
    await getPool().query<{
      id: string;
      title: string;
      detail: string;
      href: string;
    }>(`
   select o.id::text,'К отправке' title,o.order_number detail,'/admin/orders/'||o.id href from public.orders o
   where o.payment_status='paid' and o.status in ('new','confirmed','in_production') and coalesce(o.delivery_stage,'preparing')='preparing'
   and not exists(select 1 from public.order_items i left join ${source} t on t.order_item_id=i.id where i.order_id=o.id and i.purchase_mode='preorder' and (t.id is null or t.stage<>'ready'))
   union all select o.id::text,'Оплата после отмены',o.order_number,'/admin/orders/'||o.id from public.orders o where o.payment_status='paid' and o.status='cancelled'
   union all select o.id::text,'Проблема доставки',o.order_number,'/admin/orders/'||o.id from public.orders o where o.delivery_stage in ('problem','cancelled','returning','returned')
   union all select s.order_id::text,'Ошибка отправления',o.order_number||' · '||coalesce(s.last_error,''),'/admin/orders/'||o.id from public.order_shipments s join public.orders o on o.id=s.order_id where s.state in ('failed','unknown')
   union all select t.id::text,'Задержка изготовления',o.order_number||' · '||i.product_name,'/admin/production' from ${source} t join public.order_items i on i.id=t.order_item_id join public.orders o on o.id=i.order_id where o.payment_status='paid' and o.status not in ('cancelled','shipped','delivered') and t.stage<>'ready' and (t.ready_on is null or t.ready_on<(now() at time zone 'Europe/Moscow')::date)
   union all select m.id::text,'Проблема письма',coalesce(m.last_error,m.state),'/admin/messages' from public.email_messages m where m.state in ('failed','unknown','bounced','complained') and m.created_at>now()-interval '30 days'
   union all select r.id::text,'Незавершённый возврат',o.order_number||' · деньги: '||r.money_state||', изделие: '||r.goods_state,'/admin/orders/'||o.id from public.order_returns r join public.orders o on o.id=r.order_id where r.goods_state='expected' or r.money_state in ('none','sending','processing','unknown','rejected')
   order by title,detail limit 500`)
  ).rows;
}
export async function orderProduction(orderId: string) {
  const source = await productionTasksSource();
  return (
    await getPool().query<{
      ready_on: string | null;
      all_ready: boolean;
      task_count: number;
      has_unplanned: boolean;
    }>(
      `select count(*)::int task_count,bool_or(t.ready_on is null) has_unplanned,case when bool_or(t.ready_on is null) then null else to_char(max(t.ready_on),'YYYY-MM-DD') end ready_on,bool_and(t.stage='ready') all_ready from ${source} t join public.order_items i on i.id=t.order_item_id where i.order_id=$1`,
      [orderId],
    )
  ).rows[0];
}
