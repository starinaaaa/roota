import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { uuid, orderLabels, paymentLabels } from "@/lib/validation";
import { formatPrice } from "@/lib/format-price";
import { saveCustomerNotes } from "@/lib/actions/shop-operations";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const db = getPool();
  const {
    rows: [c],
  } = await db.query("select * from public.customers where id=$1", [id]);
  if (!c) notFound();
  const [orders, consents] = await Promise.all([
    db.query(
      "select o.*,coalesce((select jsonb_agg(jsonb_build_object('name',product_name,'quantity',quantity,'product_id',product_id,'mode',purchase_mode,'configuration',configuration)) from public.order_items where order_id=o.id),'[]') items from public.orders o where customer_id=$1 order by created_at desc",
      [id],
    ),
    db.query(
      "select purpose,resource,confirmed_at,direct_consent_at,revoked_at,consent_version from public.email_subscriptions where lower(email)=lower($1) or lower(email) in (select lower(customer_email) from public.orders where customer_id=$2) order by created_at desc limit 100",
      [c.email, id],
    ),
  ]);
  return (
    <div className="space-y-7">
      <Link href="/admin/customers" className="underline">
        ← Покупатели
      </Link>
      <h1 className="font-display text-section">{c.name}</h1>
      <p>
        {c.phone} · {c.email}
      </p>
      <form action={saveCustomerNotes} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <label>
          Заметки
          <textarea
            name="notes"
            defaultValue={c.notes}
            maxLength={5000}
            rows={4}
            className="admin-input"
          />
        </label>
        <button className="admin-button">Сохранить заметки</button>
      </form>
      <h2 className="text-xl">Покупки</h2>
      {orders.rows.map((o) => (
        <article key={o.id} className="border rounded-lg p-5 space-y-3">
          <Link href={`/admin/orders/${o.id}`} className="underline">
            {o.order_number}
          </Link>
          <p>
            {orderLabels[o.status]} · {paymentLabels[o.payment_status]} ·{" "}
            {formatPrice(Number(o.total_amount))}
          </p>
          <p>
            {o.items
              .map(
                (i: { name: string; quantity: number }) =>
                  `${i.name} × ${i.quantity}`,
              )
              .join(", ")}
          </p>
          <Link
            href={`/admin/orders/new?repeat=${o.id}`}
            className="admin-secondary"
          >
            Повторить как ручной заказ
          </Link>
        </article>
      ))}
      <h2 className="text-xl">Согласия по email</h2>
      <p className="text-sm text-stone-600">
        Согласия относятся к адресу и назначению. Создание ручного заказа не
        подписывает покупателя.
      </p>
      {consents.rows.map((s, i) => (
        <p key={i} className="border-b py-3">
          {{
            news: "Новости",
            cart: "Корзина",
            restock: "Поступление",
            review: "Отзыв",
          }[s.purpose as string] ?? s.purpose}{" "}
          ·{" "}
          {s.revoked_at
            ? "Отозвано"
            : s.confirmed_at || s.direct_consent_at
              ? "Действует"
              : "Не подтверждено"}{" "}
          · {s.consent_version}
        </p>
      ))}
    </div>
  );
}
