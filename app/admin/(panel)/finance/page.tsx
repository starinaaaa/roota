import { reviewHidden } from "@/lib/review-hidden";
import { reviewHasColumn } from "@/lib/review-schema";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { moscowDate, thirtyDayPeriodStart } from "@/lib/production";
import { formatPrice } from "@/lib/format-price";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  await requireAdmin();
  const p = await searchParams,
    end = z.iso.date().safeParse(p.end),
    start = z.iso.date().safeParse(p.start);
  const until = end.success ? end.data : moscowDate(),
    since = start.success ? start.data : thirtyDayPeriodStart();
  const refundStamp = (await reviewHasColumn("order_returns", "refunded_at"))
    ? "coalesce(refunded_at,updated_at)"
    : "updated_at";
  const {
    rows: [r],
  } = await getPool().query(
    `with period as (select $1::date::timestamp at time zone 'Europe/Moscow' since,($2::date+1)::timestamp at time zone 'Europe/Moscow' until),
 sales as (select o.*,coalesce(p.paid_at,o.created_at) sold_at from public.orders o left join lateral (select min(paid_at) paid_at from public.payments where order_id=o.id and mode='live' and paid_at is not null) p on true where not(o.id=any($3::uuid[])) and (p.paid_at is not null or o.payment_status in ('paid','refunded'))),
 current_sales as (select s.* from sales s,period where sold_at>=since and sold_at<until),
 returns as (select coalesce(sum(amount),0) amount from public.order_returns r,period where not(r.order_id=any($3::uuid[])) and money_state='finished' and ${refundStamp}>=since and ${refundStamp}<until)
 select count(*)::int orders,coalesce(sum(total_amount),0) sales,coalesce(avg(total_amount),0) average,(select amount from returns) refunds,
 count(*) filter(where exists(select 1 from sales older where older.customer_id=s.customer_id and (older.sold_at,older.id)<(s.sold_at,s.id)))::int repeat_orders,
 count(distinct customer_id)::int customers from current_sales s`,
    [since, until, reviewHidden.orders],
  );
  const stats = [
    ["Продажи", formatPrice(Number(r.sales))],
    ["Завершённые возвраты", formatPrice(Number(r.refunds))],
    [
      "Продажи минус возвраты",
      formatPrice(Number(r.sales) - Number(r.refunds)),
    ],
    ["Оплаченных заказов", r.orders],
    ["Средний чек", formatPrice(Number(r.average))],
    [
      "Повторных заказов",
      `${r.repeat_orders} (${r.orders ? Math.round((r.repeat_orders / r.orders) * 100) : 0}%)`,
    ],
    ["Покупателей", r.customers],
  ];
  return (
    <div className="space-y-7">
      <h1 className="font-display text-section">Финансовая сводка</h1>
      <form className="flex flex-wrap gap-4">
        <label>
          С
          <input
            required
            type="date"
            name="start"
            className="admin-input"
            defaultValue={since}
          />
        </label>
        <label>
          По
          <input
            required
            type="date"
            name="end"
            className="admin-input"
            defaultValue={until}
          />
        </label>
        <button className="admin-button">Показать</button>
      </form>
      {since > until ? (
        <p role="alert">Начало периода позже окончания.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {stats.map(([label, value]) => (
            <section key={label} className="border rounded-lg p-5">
              <h2 className="text-sm text-stone-600">{label}</h2>
              <p className="text-2xl mt-3">{value}</p>
            </section>
          ))}
        </div>
      )}
      <p className="text-sm text-stone-600">
        Период по Москве. Продажи включают доставку, учитываются по
        подтверждённой оплате; для старых ручных оплат без даты — по дате
        заказа. Возвраты учитываются по дате завершения (для старых записей —
        последнего обновления). Повторный заказ: у того же покупателя была более
        ранняя оплаченная покупка. Средний чек до возвратов. Маржа станет
        доступна после добавления себестоимости и расходов.
      </p>
    </div>
  );
}
