import { reviewHidden } from "@/lib/review-hidden";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { formatPrice } from "@/lib/format-price";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const { rows } = await getPool().query<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    purchases: number;
    net: string;
  }>(
    `select c.id,c.name,c.phone,c.email,count(o.id) filter(where o.payment_status in ('paid','refunded'))::int purchases,
   coalesce(sum(case when o.payment_status in ('paid','refunded') then o.total_amount else 0 end),0)-coalesce(sum(case when r.money_state='finished' then r.amount else 0 end),0) net
   from public.customers c left join public.orders o on o.customer_id=c.id left join public.order_returns r on r.order_id=o.id
   where not(c.id=any($2::uuid[])) and concat_ws(' ',c.name,c.phone,c.email) ilike '%'||$1||'%' group by c.id order by max(o.created_at) desc nulls last limit 200`,
    [
      q
        .trim()
        .slice(0, 100)
        .replace(/[\\%_]/g, "\\$&"),
      reviewHidden.customers,
    ],
  );
  return (
    <div className="space-y-6">
      <h1 className="font-display text-section">Покупатели</h1>
      <form className="flex gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Имя, телефон или email"
          className="admin-input"
        />
        <button className="admin-button">Найти</button>
      </form>
      <p className="text-sm text-stone-600">
        Поиск по карточкам покупателей. До 200 результатов; покупки учитываются
        после оплаты.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((c) => (
          <Link
            key={c.id}
            href={`/admin/customers/${c.id}`}
            className="border rounded-lg p-5"
          >
            <h2 className="text-xl">{c.name}</h2>
            <p>
              {c.phone} · {c.email}
            </p>
            <p className="mt-3">
              Покупок: {c.purchases} · С учётом возвратов:{" "}
              {formatPrice(Number(c.net))}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
