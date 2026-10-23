type Counts = { views: number; carts: number; payments: number };
export type ProductReport = {
  totals: Counts & { paid_orders: number; units: number };
  sources: (Counts & { source: string; medium: string; campaign: string })[];
};
const percent = (paid: number, carts: number) =>
  carts ? `${((100 * paid) / carts).toFixed(1)}%` : "—";

export default function ProductConversion({
  report,
  name,
}: {
  report: ProductReport;
  name: string;
}) {
  const t = report.totals;
  const metrics = [
    ["Просмотры карточек", t.views, "Уникальные браузеры за период"],
    ["Добавили в корзину", t.carts, "Из каталога или карточки"],
    [
      "Купили после добавления",
      t.payments,
      "Браузеры с оплатой того же товара",
    ],
    [
      "Из корзины в покупку",
      percent(t.payments, t.carts),
      `${t.payments} из ${t.carts}`,
    ],
    ["Оплаченные заказы", t.paid_orders, "По дате оплаты за период"],
    ["Продано, шт.", t.units, "По дате оплаты за период"],
  ] as const;
  return (
    <section className="space-y-4" aria-label="Конверсия товаров">
      <h3 className="text-xl">Интерес и покупки · {name}</h3>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {metrics.map(([label, value, hint]) => (
          <section className="admin-card space-y-2" key={label}>
            <h4>{label}</h4>
            <p className="text-3xl tabular-nums">{value}</p>
            <p className="text-sm text-stone-600">{hint}</p>
          </section>
        ))}
      </div>
      <p className="text-sm text-stone-600">
        Просмотр карточки не обязателен для покупки. Конверсия — доля браузеров,
        добавивших товар за выбранный период и затем оплативших заказ именно с
        ним; оплата учитывается до текущего момента, в том числе на следующий
        день. Повторные просмотры и добавления не увеличивают число браузеров.
        Для выбранных товаров каждый браузер считается один раз; покупка другого
        товара без его добавления не засчитывается. Заказы и штуки считаются
        отдельно по дате оплаты.
      </p>
      <p className="text-sm text-stone-600">
        Посетитель определяется cookie браузера сроком 30 дней. Другой браузер,
        устройство или удаление cookie создают нового посетителя. Учитываются
        только подтверждённые рабочие оплаты Robokassa. При небольшом числе
        добавлений сравнивайте абсолютные числа: одна покупка сильно меняет
        процент.
      </p>
      {!t.views && !t.carts && !t.paid_orders && (
        <p className="admin-card">
          За этот период данных по выбранным товарам пока нет.
        </p>
      )}
      <section className="admin-card space-y-3">
        <h4 className="text-lg">Источники интереса и покупок</h4>
        <p className="text-sm text-stone-600">
          Первый источник браузера. До 50 источников; события хранятся 90 дней.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                {[
                  "Источник / канал / кампания",
                  "Просмотры карточек",
                  "Добавили",
                  "Купили после добавления",
                  "Из корзины в покупку",
                ].map((label) => (
                  <th className="p-2" key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.sources.map((s) => (
                <tr
                  key={JSON.stringify([s.source, s.medium, s.campaign])}
                  className="border-t border-stone-100"
                >
                  <td className="p-2">
                    {s.source || "Прямой / неизвестный"} / {s.medium || "—"} /{" "}
                    {s.campaign || "—"}
                  </td>
                  <td className="p-2">{s.views}</td>
                  <td className="p-2">{s.carts}</td>
                  <td className="p-2">{s.payments}</td>
                  <td className="p-2">{percent(s.payments, s.carts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
