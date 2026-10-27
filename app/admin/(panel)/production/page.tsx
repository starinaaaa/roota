import Link from "next/link";
import { productionQueue } from "@/lib/shop-operations";
import { productionStages, readyDateLabel } from "@/lib/production";
import { gardenParts } from "@/lib/garden";
import { saveProductionTask } from "@/lib/actions/shop-operations";
export default async function Page() {
  const tasks = await productionQueue();
  const parts = Object.fromEntries(
    gardenParts.map((p) => [
      p.key,
      tasks
        .filter((t) => t.stage !== "ready")
        .reduce(
          (sum, t) => sum + (t.configuration?.[p.key] ?? 0) * t.quantity,
          0,
        ),
    ]),
  );
  return (
    <div className="space-y-8">
      <h1 className="font-display text-section">Очередь изготовления</h1>
      <section className="border rounded-lg p-5">
        <h2 className="text-xl">Партия «Садов»: осталось изготовить</h2>
        <div className="flex flex-wrap gap-6 mt-4">
          {gardenParts.map((p) => (
            <p key={p.key}>
              {p.label}: <strong>{parts[p.key]}</strong>
            </p>
          ))}
        </div>
        <p className="mt-3 text-sm text-stone-600">
          Сумма деталей оплаченных незавершённых наборов. Готовые наборы
          исключены.
        </p>
      </section>
      {!tasks.length && <p>Оплаченных предзаказов в работе нет.</p>}
      {tasks.map((t) => (
        <article
          key={t.id}
          className={`border rounded-lg p-5 space-y-4 ${t.overdue ? "border-red-600" : "border-stone-300"}`}
        >
          <Link className="underline" href={`/admin/orders/${t.order_id}`}>
            {t.order_number}
          </Link>
          <h2 className="text-xl">
            {t.product_name} × {t.quantity}
          </h2>
          <p>
            {t.ready_on
              ? `Плановая готовность: ${readyDateLabel(t.ready_on)}`
              : "Нужна дата готовности"}
            {t.overdue ? " · Просрочено" : ""}
          </p>
          <form
            action={saveProductionTask}
            className="grid sm:grid-cols-2 gap-4"
          >
            <input type="hidden" name="id" value={t.id} />
            <label>
              Этап
              <select
                name="stage"
                defaultValue={t.stage}
                className="admin-input"
              >
                {Object.entries(productionStages).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Готовность
              <input
                required
                name="ready_on"
                type="date"
                defaultValue={t.ready_on ?? ""}
                className="admin-input"
              />
            </label>
            <label>
              Ближайшее действие
              <input
                name="next_action"
                maxLength={500}
                defaultValue={t.next_action}
                className="admin-input"
              />
            </label>
            <label>
              Причина изменения
              <input
                required
                minLength={3}
                maxLength={500}
                name="reason"
                className="admin-input"
                placeholder="План партии / согласованный перенос"
              />
            </label>
            <button className="admin-button">Сохранить</button>
          </form>
        </article>
      ))}
    </div>
  );
}
