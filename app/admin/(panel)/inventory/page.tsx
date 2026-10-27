import { reviewQuery } from "@/lib/review-schema";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { adjustInventory } from "@/lib/actions/shop-operations";
const kinds: Record<string, string> = {
  opening: "Начальный остаток",
  reserve: "Резерв",
  release: "Освобождение резерва",
  sale: "Продажа",
  defect: "Брак",
  return: "Возврат",
  manufactured: "Изготовлено",
  adjustment: "Корректировка",
};
export default async function Page() {
  await requireAdmin();
  const [products, movements] = await Promise.all([
    getPool().query(
      "select p.id,p.name,p.stock_qty,coalesce((select sum(i.quantity) from public.order_items i join public.orders o on o.id=i.order_id where i.product_id=p.id and i.purchase_mode='stock' and o.reservation_state='active'),0)::int reserved from public.products p order by name",
    ),
    reviewQuery("inventory_movements",
      "select m.*,p.name,o.order_number from public.inventory_movements m join public.products p on p.id=m.product_id left join public.orders o on o.id=m.order_id order by m.created_at desc,m.id desc limit 300",
    ),
  ]);
  return (
    <div className="space-y-7">
      <h1 className="font-display text-section">Склад и движения</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {products.rows.map((p) => (
          <p key={p.id} className="border rounded p-4">
            {p.name} · Свободно: {p.stock_qty} · Резерв: {p.reserved}
          </p>
        ))}
      </div>
      <form
        action={adjustInventory}
        className="border rounded-lg p-5 grid gap-4 md:grid-cols-2"
      >
        <label>
          Изделие
          <select name="product_id" className="admin-input">
            {products.rows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Изменение количества (+/−)
          <input
            required
            name="delta"
            type="number"
            min={-100000}
            max={100000}
            className="admin-input"
          />
        </label>
        <label>
          Причина
          <select name="kind" className="admin-input">
            {["adjustment", "defect", "return", "manufactured"].map((k) => (
              <option key={k} value={k}>
                {kinds[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Основание
          <input
            name="reason"
            required
            minLength={5}
            maxLength={500}
            className="admin-input"
          />
        </label>
        <button className="admin-button">Записать движение</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Время МСК",
                "Изделие",
                "Причина",
                "Изменение",
                "Остаток",
                "Заказ",
              ].map((h) => (
                <th key={h} className="p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movements.rows.map((m) => (
              <tr className="border-t" key={m.id}>
                <td className="p-3">
                  {m.created_at.toLocaleString("ru-RU", {
                    timeZone: "Europe/Moscow",
                  })}
                </td>
                <td className="p-3">{m.name}</td>
                <td className="p-3">
                  {kinds[m.kind] ?? m.kind}
                  <p className="text-stone-600">{m.reason}</p>
                </td>
                <td className="p-3">
                  {m.delta > 0 ? "+" : ""}
                  {m.delta}
                </td>
                <td className="p-3">{m.balance}</td>
                <td className="p-3">
                  {m.order_id && (
                    <Link
                      className="underline"
                      href={`/admin/orders/${m.order_id}`}
                    >
                      {m.order_number}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-stone-600">
        Продажа исполняет резерв и повторно не списывает свободный остаток.
        Возврат денег не восстанавливает изделия: после осмотра запишите
        отдельное движение.
      </p>
    </div>
  );
}
