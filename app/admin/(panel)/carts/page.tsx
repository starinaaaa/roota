import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";
import { unfinishedCartsSql } from "@/lib/analytics/checkout-queries";
import { checkoutStages } from "@/lib/analytics/checkout-progress";
import { formatPrice } from "@/lib/format-price";
export const dynamic = "force-dynamic";

type Cart = {
  browser_id: string;
  items: { name: string; quantity: number; mode: string }[];
  goods_total: string;
  last_activity: Date;
  inactive: boolean;
  stage: keyof typeof checkoutStages | "cart";
  delivery_method: string | null;
  point_id: string | null;
  delivery_cost: string | null;
  email: string | null;
  reminder_state: string | null;
  order_id: string | null;
  order_number: string | null;
};
const reminderLabels: Record<string, string> = {
  pending: "Запланировано",
  sent: "Отправлено",
  sending: "Отправляется",
  failed: "Ошибка отправки",
  cancelled: "Отменено",
  rejected: "Отклонено",
};
export default async function CartsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  let filters;
  try {
    filters = parseAnalyticsFilters(params);
  } catch {
    notFound();
  }
  const { days, start, end } = filters;
  const inactiveOnly = params.activity !== "all";
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(params.page) || 1)),
  );
  const result = await getPool().query<Cart>(unfinishedCartsSql, [
    days,
    start || null,
    end || null,
    inactiveOnly,
    (page - 1) * 50,
  ]);
  const carts = result.rows.slice(0, 50);
  const pageUrl = (next: number) => {
    const q = new URLSearchParams({
      days: String(days),
      activity: inactiveOnly ? "inactive" : "all",
      page: String(next),
    });
    if (start) {
      q.set("start", start);
      q.set("end", end);
    }
    return `/admin/carts?${q}`;
  };
  return (
    <div className="space-y-6">
      <h2 className="text-2xl">Незавершённые корзины</h2>
      <p className="text-sm text-stone-600">
        Корзины с товарами, которые ещё не купили. По умолчанию — без активности
        30 минут. Посетитель мог ещё вернуться к покупке. Причина ухода
        неизвестна: получение стоимости доставки не означает отказ из-за цены.
      </p>
      <form className="flex flex-wrap items-end gap-3">
        <label>
          Период
          <select className="admin-input" name="days" defaultValue={days}>
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} дней
              </option>
            ))}
          </select>
        </label>
        <label>
          С
          <input
            className="admin-input"
            type="date"
            name="start"
            defaultValue={start}
          />
        </label>
        <label>
          По включительно
          <input
            className="admin-input"
            type="date"
            name="end"
            defaultValue={end}
          />
        </label>
        <label>
          Активность
          <select
            className="admin-input"
            name="activity"
            defaultValue={inactiveOnly ? "inactive" : "all"}
          >
            <option value="inactive">Без активности 30 минут</option>
            <option value="all">Все, включая активные</option>
          </select>
        </label>
        <button className="admin-secondary">Показать</button>
        {(start || end) && (
          <Link className="admin-secondary" href="/admin/carts">
            Сбросить даты
          </Link>
        )}
      </form>
      <p className="text-sm text-stone-600">
        Период — по последней активности, даты по Москве. Подробные шаги
        появятся после публикации обновления. Старые корзины показывают только
        уже сохранённые действия. История — до 90 дней. Ваш исключённый браузер
        скрыт.
      </p>
      <p className="text-sm text-stone-600">
        Email виден только при сохранённом действующем согласии на письма. Без
        него — анонимный посетитель. Введённые имя, телефон и адрес до создания
        заказа здесь не собираются. Шаблоны и журнал напоминаний находятся в{" "}
        <Link href="/admin/messages" className="underline">
          «Сообщениях»
        </Link>
        .
      </p>
      {!carts.length ? (
        <p className="admin-card">За выбранный период таких корзин нет.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                {[
                  "Посетитель",
                  "Товары",
                  "Последнее действие",
                  "Доставка",
                  "Последняя активность · Москва",
                  "Напоминание",
                ].map((label) => (
                  <th key={label} className="p-3" scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carts.map((cart) => (
                <tr
                  key={cart.browser_id}
                  className="border-t border-stone-200 align-top"
                >
                  <td className="p-3">
                    {cart.email ?? `Анонимный · ${cart.browser_id.slice(0, 8)}`}
                    {cart.order_id && (
                      <Link
                        className="block mt-2 underline"
                        href={`/admin/orders/${cart.order_id}`}
                      >
                        Заказ {cart.order_number}
                      </Link>
                    )}
                  </td>
                  <td className="p-3 min-w-48">
                    {cart.items.map((item, i) => (
                      <p key={i}>
                        {item.name} × {item.quantity}
                        {item.mode === "preorder" ? " · предзаказ" : ""}
                      </p>
                    ))}
                    <p className="mt-2 text-stone-600">
                      Товары: {formatPrice(Number(cart.goods_total))}
                    </p>
                  </td>
                  <td className="p-3 min-w-48">
                    {cart.order_id
                      ? "Заказ создан, не оплачен"
                      : cart.stage === "cart"
                        ? "Добавил в корзину"
                        : checkoutStages[cart.stage]}
                    <p className="mt-2 text-stone-600">
                      {cart.inactive
                        ? "Без активности 30 минут"
                        : "Недавно активен"}
                    </p>
                  </td>
                  <td className="p-3">
                    {cart.delivery_method === "yandex_courier"
                      ? "Курьер Яндекс"
                      : cart.delivery_method
                        ? "Ozon"
                        : "—"}
                    {cart.point_id && <p>ПВЗ #{cart.point_id}</p>}
                    {cart.delivery_cost !== null && (
                      <p className="mt-2">
                        Получил расчёт:{" "}
                        {formatPrice(Number(cart.delivery_cost))}
                      </p>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {new Intl.DateTimeFormat("ru-RU", {
                      timeZone: "Europe/Moscow",
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(cart.last_activity)}
                  </td>
                  <td className="p-3">
                    {cart.reminder_state
                      ? (reminderLabels[cart.reminder_state] ??
                        cart.reminder_state)
                      : cart.email
                        ? "Пока не запланировано"
                        : "Нет согласия / email"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-3">
        {page > 1 && (
          <Link className="admin-secondary" href={pageUrl(page - 1)}>
            Назад
          </Link>
        )}
        {result.rows.length > 50 && (
          <Link className="admin-secondary" href={pageUrl(page + 1)}>
            Далее
          </Link>
        )}
      </div>
    </div>
  );
}
