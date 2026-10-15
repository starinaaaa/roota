import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
type Counts = {
  views: number;
  carts: number;
  checkouts: number;
  orders: number;
  payments: number;
};
type Source = Counts & { source: string; medium: string; campaign: string };
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin();
  const { days: input } = await searchParams;
  const days = [7, 30, 90].includes(Number(input)) ? Number(input) : 30;
  const { data, error } = await createServerClient().rpc("funnel_report", {
    p_days: days,
  });
  if (error || !data) throw new Error("Не удалось загрузить воронку");
  const report = data as {
    totals: Counts;
    sources: Source[];
    errors: { detail: string; total: number }[];
  };
  const stages = [
    ["Просмотры", report.totals.views],
    ["Корзина", report.totals.carts],
    ["Оформление", report.totals.checkouts],
    ["Заказ создан", report.totals.orders],
    ["Оплата", report.totals.payments],
  ] as const;
  const percent = (a: number, b: number) =>
    b ? `${((100 * a) / b).toFixed(1)}%` : "—";
  return (
    <div className="space-y-6">
      <h2 className="text-2xl">Воронка продаж и источники</h2>
      <form className="flex gap-3 items-end">
        <label>
          Период
          <select name="days" className="admin-input" defaultValue={days}>
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} дней
              </option>
            ))}
          </select>
        </label>
        <button className="admin-secondary">Показать</button>
      </form>
      <p className="text-sm text-stone-600">
        Уникальные сессии, прошедшие этапы последовательно. Период относится к
        первому просмотру внутри выбранного периода; более поздние этапы
        учитываются до текущего момента. Оплата — только подтверждённый рабочий
        платёж Robokassa. Повторный платёжный callback не увеличивает счётчик.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {stages.map(([label, count], i) => (
          <section className="admin-card space-y-2" key={label}>
            <h3>{label}</h3>
            <p className="text-3xl tabular-nums">{count}</p>
            <p className="text-sm text-stone-600">
              {i
                ? `${percent(count, stages[i - 1][1])} от предыдущего этапа`
                : "Сессии витрины"}
            </p>
            <div className="h-1 bg-stone-100">
              <div
                className="h-1 bg-stone-700"
                style={{
                  width: report.totals.views
                    ? `${(100 * count) / report.totals.views}%`
                    : "0%",
                }}
              />
            </div>
          </section>
        ))}
      </div>
      {!report.totals.views && (
        <p className="admin-card">
          Пока нет данных. Сбор начинается после публикации этой версии; прежние
          заказы не подменяют события воронки.
        </p>
      )}
      <section className="admin-card space-y-3">
        <h3 className="text-lg">Источники и UTM</h3>
        <p className="text-sm text-stone-600">
          Первый источник сессии. Без UTM — прямой / неизвестный. До 50
          источников; хранение событий — 90 дней. Заблокированный JavaScript,
          боты и переход с другого устройства могут влиять на полноту данных.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                {[
                  "Источник / канал / кампания",
                  "Просмотры",
                  "Корзина",
                  "Оформление",
                  "Заказы",
                  "Оплаты",
                  "Конверсия",
                ].map((t) => (
                  <th key={t} className="p-2">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.sources.map((s, i) => (
                <tr key={i} className="border-t border-stone-100">
                  <td className="p-2">
                    {s.source || "Прямой / неизвестный"} / {s.medium || "—"} /{" "}
                    {s.campaign || "—"}
                  </td>
                  {[s.views, s.carts, s.checkouts, s.orders, s.payments].map(
                    (v, j) => (
                      <td key={j} className="p-2">
                        {v}
                      </td>
                    ),
                  )}
                  <td className="p-2">{percent(s.payments, s.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="admin-card space-y-2">
        <h3 className="text-lg">Ошибки оформления</h3>
        {report.errors.length ? (
          report.errors.map((e) => (
            <p key={e.detail}>
              {(
                {
                  order_submission: "Не удалось оформить заказ",
                  payment_widget: "Не открылась форма оплаты",
                  payment_status: "Недоступна проверка оплаты",
                  payment_failed: "Возврат с неуспешной оплаты",
                  payment_expired: "Истёк резерв оплаты",
                } as Record<string, string>
              )[e.detail] ?? e.detail}{" "}
              — {e.total}
            </p>
          ))
        ) : (
          <p>Ошибок за период не зафиксировано.</p>
        )}
      </section>
    </div>
  );
}
