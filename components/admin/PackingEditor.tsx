"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  savePackingRule,
  syncDeliveryPoints,
} from "@/lib/actions/delivery-admin";
import type { PackingRule } from "@/lib/delivery/model";
type Props = {
  rules: PackingRule[];
  categories: { id: string; name: string }[];
  configured: boolean;
  pointCount: number;
  syncedAt: string | null;
};
export default function PackingEditor({
  rules,
  categories,
  configured,
  pointCount,
  syncedAt,
}: Props) {
  const blank = () => ({
    id: undefined as string | undefined,
    name: "",
    composition: [{ category_id: categories[0]?.id ?? "", quantity: 1 }],
    weight_g: 500,
    length_mm: 230,
    width_mm: 230,
    height_mm: 50,
    active: true,
  });
  const [form, setForm] = useState(blank),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter();
  return (
    <div className="space-y-6">
      <h2 className="text-xl">Доставка и упаковка</h2>
      <section className="admin-card space-y-3">
        <h3 className="text-lg">Ozon Доставка</h3>
        <p>
          {configured
            ? "Настройки приложения заданы"
            : "Добавьте OZON_CLIENT_ID, OZON_CLIENT_SECRET и OZON_SHIPMENT_METHOD_ID (необязателен, если в Ozon один активный метод) в Vercel."}
        </p>
        <p>Загружено активных ПВЗ: {pointCount}</p>
        {syncedAt && (
          <p className="text-sm text-stone-500">
            Последнее обновление:{" "}
            {new Date(syncedAt).toLocaleString("ru-RU", {
              timeZone: "Europe/Moscow",
            })}
          </p>
        )}
        <p className="text-sm text-stone-500">
          Каталог обновляется автоматически каждый день. Кнопка ниже запускает
          внеплановое обновление. Доступность доставки проверяется при выборе
          ПВЗ для конкретного заказа.
        </p>
        <button
          className="admin-secondary"
          disabled={pending || !configured}
          onClick={() =>
            start(async () => {
              let count = 0;
              setMessage("Загружаем пункты…");
              try {
                for (let page = 0; page < 1000; page++) {
                  const result = await syncDeliveryPoints();
                  if (result.error) {
                    setMessage(result.error);
                    return;
                  }
                  count += result.count ?? 0;
                  setMessage(`Загружено пунктов за этот запуск: ${count}`);
                  if (!result.more) {
                    router.refresh();
                    return;
                  }
                }
                setMessage("Продолжите обновление следующим запуском.");
              } catch {
                setMessage("Загрузка прервана. Повторите, чтобы продолжить.");
              }
            })
          }
        >
          Обновить пункты выдачи
        </button>
      </section>
      <section className="admin-card space-y-4">
        <h3 className="text-lg">Правила упаковки</h3>
        <p className="text-sm text-stone-600">
          Правило применяется к точному составу корзины по категориям и
          количеству. Вес — всей посылки с коробкой и защитой. Размеры — внешние
          размеры общей коробки. Для неизвестного сочетания доставка не
          рассчитывается.
        </p>
        <div className="flex flex-wrap gap-2">
          {rules.map((r) => (
            <button
              type="button"
              key={r.id}
              className="admin-secondary"
              onClick={() => {
                setForm({ ...r });
                setMessage("");
              }}
            >
              {r.name}
              {!r.active ? " · отключено" : ""}
            </button>
          ))}
          <button
            type="button"
            className="admin-secondary"
            onClick={() => {
              setForm(blank());
              setMessage("");
            }}
          >
            Новое правило
          </button>
        </div>
        <form
          className="grid md:grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              try {
                const result = await savePackingRule(form);
                setMessage(result.error ?? "Правило сохранено.");
                if (!result.error) {
                  router.refresh();
                  setForm(blank());
                }
              } catch {
                setMessage("Не удалось сохранить правило.");
              }
            });
          }}
        >
          <label>
            Название
            <input
              required
              maxLength={100}
              className="admin-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Вес посылки, г
            <input
              required
              type="number"
              min={1}
              max={100000}
              className="admin-input"
              value={form.weight_g}
              onChange={(e) =>
                setForm({ ...form, weight_g: Number(e.target.value) })
              }
            />
          </label>
          <fieldset className="md:col-span-2 space-y-3">
            <legend className="mb-2">Состав общей коробки</legend>
            {form.composition.map((item, index) => (
              <div key={index} className="flex flex-wrap gap-3 items-end">
                <label className="flex-1 min-w-40">
                  Категория
                  <select
                    className="admin-input"
                    value={item.category_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        composition: form.composition.map((v, i) =>
                          i === index
                            ? { ...v, category_id: e.target.value }
                            : v,
                        ),
                      })
                    }
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Количество
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    className="admin-input max-w-24"
                    value={item.quantity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        composition: form.composition.map((v, i) =>
                          i === index
                            ? { ...v, quantity: Number(e.target.value) }
                            : v,
                        ),
                      })
                    }
                  />
                </label>
                {form.composition.length > 1 && (
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() =>
                      setForm({
                        ...form,
                        composition: form.composition.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    Убрать
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="admin-secondary"
              onClick={() =>
                setForm({
                  ...form,
                  composition: [
                    ...form.composition,
                    {
                      category_id:
                        categories.find(
                          (c) =>
                            !form.composition.some(
                              (v) => v.category_id === c.id,
                            ),
                        )?.id ?? "",
                      quantity: 1,
                    },
                  ],
                })
              }
            >
              Добавить категорию
            </button>
          </fieldset>
          {(
            [
              ["length_mm", "Длина"],
              ["width_mm", "Ширина"],
              ["height_mm", "Высота"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}, см
              <input
                type="number"
                step="0.1"
                min="0.1"
                max={300}
                required
                className="admin-input"
                value={form[key] / 10}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [key]: Math.round(Number(e.target.value) * 10),
                  })
                }
              />
            </label>
          ))}
          <label className="flex gap-3 items-center">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Правило включено
          </label>
          <button disabled={pending} className="admin-button">
            {pending ? "Сохраняю…" : "Сохранить правило"}
          </button>
        </form>
      </section>
      <p role="status">{message}</p>
    </div>
  );
}
