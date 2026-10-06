import Link from "next/link";
import { listOrders } from "@/lib/admin-data";
import { orderLabels, paymentLabels } from "@/lib/validation";
import { formatPrice } from "@/lib/products";
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    payment?: string;
    mode?: string;
    page?: string;
  }>;
}) {
  const p = await searchParams,
    page = Math.max(1, Math.floor(Number(p.page) || 1)),
    { orders, count } = await listOrders(
      p.q,
      p.status,
      p.payment,
      page,
      p.mode,
    );
  return (
    <div className="space-y-6">
      <h2 className="text-xl">Заказы · {count}</h2>
      <form className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <label>
          Режим
          <select
            name="mode"
            className="admin-input"
            defaultValue={p.mode ?? ""}
          >
            <option value="">Все заказы</option>
            <option value="live">Обычные</option>
            <option value="test">Тестовые</option>
          </select>
        </label>
        <label>
          Поиск
          <input
            className="admin-input"
            name="q"
            defaultValue={p.q}
            placeholder="Номер или покупатель"
            maxLength={100}
          />
        </label>
        <label>
          Статус
          <select
            name="status"
            className="admin-input"
            defaultValue={p.status ?? ""}
          >
            <option value="">Все</option>
            {Object.entries(orderLabels)
              .filter(([k]) => k !== "in_production")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </label>
        <label>
          Оплата
          <select
            name="payment"
            className="admin-input"
            defaultValue={p.payment ?? ""}
          >
            <option value="">Все</option>
            {Object.entries(paymentLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button className="admin-button self-end">Найти</button>
      </form>
      <div className="space-y-3">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={
              o.mode === "test"
                ? `/admin/orders/test/${o.id}`
                : `/admin/orders/${o.id}`
            }
            className="admin-card grid md:grid-cols-[1.2fr_1fr_1fr_1fr] gap-3 hover:border-stone-500"
          >
            <div>
              <strong>{o.order_number}</strong>
              {o.mode === "test" && (
                <span className="ml-2 text-xs text-amber-800">ТЕСТ</span>
              )}
              <p className="text-sm text-stone-600">
                {new Date(o.created_at).toLocaleString("ru-RU", {
                  timeZone: "Europe/Moscow",
                })}
              </p>
            </div>
            <p>{o.customer_name}</p>
            <p>{formatPrice(o.total_amount)}</p>
            <div>
              <p>
                {o.mode === "test"
                  ? "Тестовый · без отправки"
                  : orderLabels[o.status]}
              </p>
              <p className="text-sm text-stone-600">
                Оплата: {paymentLabels[o.payment_status]}
              </p>
            </div>
          </Link>
        ))}
        {!orders.length && <p className="admin-card">Заказы не найдены.</p>}
      </div>
      <div className="flex gap-3">
        {[page - 1, page + 1]
          .filter((n) => n > 0 && (n - 1) * 30 < count)
          .map((n) => (
            <Link
              key={n}
              className="admin-secondary"
              href={
                "?" +
                new URLSearchParams({
                  q: p.q ?? "",
                  status: p.status ?? "",
                  payment: p.payment ?? "",
                  mode: p.mode ?? "",
                  page: String(n),
                })
              }
            >
              {n < page ? "← Назад" : "Далее →"}
            </Link>
          ))}
      </div>
    </div>
  );
}
