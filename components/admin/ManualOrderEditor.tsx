"use client";
import { useState, useTransition } from "react";
import { createManualDraft } from "@/lib/actions/manual-orders";
import { defaultGarden } from "@/lib/garden";
import type { ManualItem } from "@/lib/manual-orders";
type Product = {
  id: string;
  name: string;
  price: number;
  stock_qty: number;
  preorder_enabled: boolean;
  lead_time_days: number | null;
  configurator: string | null;
};
export default function ManualOrderEditor({
  products,
  initial,
}: {
  products: Product[];
  initial?: {
    customer_name: string;
    email: string;
    phone: string;
    items: ManualItem[];
  };
}) {
  const [items, setItems] = useState<ManualItem[]>(initial?.items ?? []),
    [result, setResult] = useState(""),
    [pending, start] = useTransition();
  const update = (index: number, patch: Partial<ManualItem>) =>
    setItems((prev) =>
      prev.map((i, n) => (n === index ? { ...i, ...patch } : i)),
    );
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await createManualDraft({
            ...Object.fromEntries(f),
            items,
            delivery_amount: Number(f.get("delivery_amount")),
          });
          setResult(r.url ?? r.error ?? "");
        });
      }}
    >
      <fieldset disabled={pending} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label>
            Покупатель
            <input
              required
              name="customer_name"
              defaultValue={initial?.customer_name}
              className="admin-input"
              maxLength={100}
            />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              name="email"
              defaultValue={initial?.email}
              className="admin-input"
            />
          </label>
          <label>
            Телефон
            <input
              required
              name="phone"
              defaultValue={initial?.phone ?? "+7"}
              className="admin-input"
            />
          </label>
        </div>
        {items.map((i, index) => (
          <fieldset
            key={index}
            className="border rounded-lg p-4 grid gap-3 md:grid-cols-3"
          >
            <legend>{i.name}</legend>
            <label>
              Название
              <input
                required
                value={i.name}
                disabled={!!i.product_id}
                onChange={(e) => update(index, { name: e.target.value })}
                className="admin-input"
              />
            </label>
            <label>
              Цена, ₽
              <input
                required
                type="number"
                min={1}
                value={i.price}
                onChange={(e) =>
                  update(index, { price: Number(e.target.value) })
                }
                className="admin-input"
              />
            </label>
            <label>
              Количество
              <input
                required
                type="number"
                min={1}
                max={i.configuration ? 1 : 100}
                value={i.quantity}
                onChange={(e) =>
                  update(index, { quantity: Number(e.target.value) })
                }
                className="admin-input"
              />
            </label>
            <label>
              Режим
              <select
                value={i.mode}
                onChange={(e) =>
                  update(index, {
                    mode: e.target.value as "stock" | "preorder",
                    lead_days: e.target.value === "preorder" ? 21 : null,
                  })
                }
                className="admin-input"
              >
                <option value="preorder">На изготовление</option>
                {i.product_id && !i.configuration && (
                  <option value="stock">Со склада</option>
                )}
              </select>
            </label>
            {i.mode === "preorder" && (
              <label>
                Срок после оплаты, дней
                <input
                  required
                  type="number"
                  min={1}
                  max={365}
                  value={i.lead_days ?? 21}
                  onChange={(e) =>
                    update(index, { lead_days: Number(e.target.value) })
                  }
                  className="admin-input"
                />
              </label>
            )}
            {i.configuration && (
              <div className="flex gap-3 flex-wrap">
                {(["stems", "flowers", "leaves"] as const).map((k) => (
                  <label key={k}>
                    {
                      {
                        stems: "Стебли",
                        flowers: "Цветочки",
                        leaves: "Листочки",
                      }[k]
                    }
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={i.configuration![k]}
                      onChange={(e) =>
                        update(index, {
                          configuration: {
                            ...i.configuration!,
                            size: 0,
                            [k]: Number(e.target.value),
                          },
                        })
                      }
                      className="admin-input w-24"
                    />
                  </label>
                ))}
              </div>
            )}
            <button
              type="button"
              className="underline"
              onClick={() => setItems(items.filter((_, n) => n !== index))}
            >
              Убрать
            </button>
          </fieldset>
        ))}
        <label className="block">
          Добавить изделие
          <select
            className="admin-input"
            value=""
            onChange={(e) => {
              const p = products.find((p) => p.id === e.target.value);
              if (p)
                setItems([
                  ...items,
                  {
                    product_id: p.id,
                    name: p.name,
                    price: p.price,
                    quantity: 1,
                    mode:
                      p.stock_qty > 0 && p.configurator !== "garden"
                        ? "stock"
                        : "preorder",
                    lead_days: p.lead_time_days ?? 21,
                    configuration:
                      p.configurator === "garden" ? defaultGarden() : null,
                  },
                ]);
            }}
          >
            <option value="">Выберите из каталога</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="admin-secondary"
          onClick={() =>
            setItems([
              ...items,
              {
                product_id: null,
                name: "Индивидуальное изделие",
                price: 1000,
                quantity: 1,
                mode: "preorder",
                lead_days: 21,
                configuration: null,
              },
            ])
          }
        >
          Добавить индивидуальное изделие
        </button>
        <label className="block">
          Получение
          <select name="delivery_method" className="admin-input">
            <option value="pickup">Самовывоз по согласованию</option>
            <option value="yandex_courier">
              Яндекс Курьер, оплачивается отдельно
            </option>
            <option value="agreed">Доставка по согласованным условиям</option>
          </select>
        </label>
        <label className="block">
          Адрес и условия получения
          <input
            name="delivery_address"
            className="admin-input"
            maxLength={500}
          />
        </label>
        <label className="block">
          Согласованная доставка, ₽ (для Яндекс — 0)
          <input
            name="delivery_amount"
            type="number"
            min={0}
            defaultValue={0}
            className="admin-input"
          />
        </label>
        <label className="block">
          Комментарий покупателю
          <textarea name="comment" className="admin-input" maxLength={2000} />
        </label>
        <p>
          Ссылка действует 7 дней. Резерв и заказ создаются после подтверждения
          покупателем. Автоматическая отправка Ozon для этого способа не
          создаётся.
        </p>
        <button disabled={pending || !items.length} className="admin-button">
          Подготовить ссылку для подтверждения и оплаты
        </button>
      </fieldset>
      {result && (
        <p role="status" className="break-all">
          {result.startsWith("http") ? (
            <a className="underline" href={result}>
              {result}
            </a>
          ) : (
            result
          )}
        </p>
      )}
    </form>
  );
}
