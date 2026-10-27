import { reviewQuery } from "@/lib/review-schema";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  checkoutFieldLabels,
  checkoutCodeLabels,
  type CheckoutErrorField,
} from "@/lib/analytics/checkout-errors";
export default async function Page() {
  await requireAdmin();
  const { rows } = await reviewQuery<{
    id: string;
    field: CheckoutErrorField;
    code: string;
    created_at: Date;
    corrected_at: Date | null;
    order_id: string | null;
    order_number: string | null;
    payment_status: string | null;
  }>(
    "checkout_obstacles",
    `select e.*,o.order_number,o.payment_status from public.checkout_obstacles e left join public.orders o on o.id=e.order_id where not exists(select 1 from public.analytics_excluded_sessions x where x.id=e.session_id) order by e.created_at desc limit 300`,
  );
  return (
    <div className="space-y-6">
      <h1 className="font-display text-section">Ошибки оформления</h1>
      <p className="text-sm text-stone-600">
        Последние 300 событий за срок хранения 90 дней. Поле и код проверки;
        введённые значения сюда не записываются.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["Время МСК", "Поле", "Код", "Исправление", "Заказ"].map((x) => (
                <th key={x} className="p-3">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  {r.created_at.toLocaleString("ru-RU", {
                    timeZone: "Europe/Moscow",
                  })}
                </td>
                <td className="p-3">{checkoutFieldLabels[r.field]}</td>
                <td className="p-3 font-mono">
                  {r.code}
                  <p className="font-body mt-1">{checkoutCodeLabels[r.code]}</p>
                </td>
                <td className="p-3">
                  {r.corrected_at ? "Исправлена" : "Пока не исправлена"}
                </td>
                <td className="p-3">
                  {r.order_id ? (
                    <Link
                      className="underline"
                      href={`/admin/orders/${r.order_id}`}
                    >
                      {r.order_number} ·{" "}
                      {r.payment_status === "paid"
                        ? "Оплачен"
                        : r.payment_status === "refunded"
                          ? "Возврат"
                          : "Создан"}
                    </Link>
                  ) : (
                    "Не создан"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>Ошибок пока нет.</p>}
    </div>
  );
}
