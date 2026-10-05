"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrder, retryNotification } from "@/lib/actions/admin";
import { orderLabels, paymentLabels } from "@/lib/validation";
import { formatPrice } from "@/lib/products";
type OrderData = {
  id: string;
  order_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  total_amount: number;
  status: string;
  payment_status: string;
  delivery_type: string;
  delivery_address: string | null;
  comment: string | null;
  internal_notes: string;
  tracking_number: string;
  reservation_state: string;
  items: {
    id: string;
    product_name: string;
    quantity: number;
    price: number;
    purchase_mode: string;
    lead_time_days: number | null;
  }[];
  events: {
    id: string;
    kind: string;
    old_value: string | null;
    new_value: string | null;
    reason: string | null;
    created_at: string;
  }[];
  notification: { state: string; attempts: number }[];
};
export default function OrderEditor({ order }: { order: OrderData }) {
  const [form, setForm] = useState({
      id: order.id,
      status: order.status === "in_production" ? "confirmed" : order.status,
      payment_status: order.payment_status,
      internal_notes: order.internal_notes,
      tracking_number: order.tracking_number,
      reason: "",
    }),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter();
  const field = (name: keyof typeof form, value: string) =>
    setForm((v) => ({ ...v, [name]: value }));
  return (
    <div className="space-y-6">
      <h2 className="text-xl">Заказ {order.order_number}</h2>
      <p>
        {new Date(order.created_at).toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        })}
      </p>
      {!order.items.length && (
        <p role="alert" className="admin-card text-amber-800">
          У этого старого заказа отсутствует состав. Перед выполнением сверьте
          его с покупателем.
        </p>
      )}
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="admin-card space-y-3">
          <h3 className="text-lg">Покупатель и доставка</h3>
          <p>{order.customer_name}</p>
          <a className="block underline" href={"tel:" + order.customer_phone}>
            {order.customer_phone}
          </a>
          {order.customer_email && (
            <a
              className="block underline"
              href={"mailto:" + order.customer_email}
            >
              {order.customer_email}
            </a>
          )}
          <p>
            {{ moscow: "Москва", russia: "По России", pickup: "Самовывоз" }[
              order.delivery_type
            ] ?? order.delivery_type}
          </p>
          <p className="whitespace-pre-wrap break-words">
            {order.delivery_address}
          </p>
          <p className="whitespace-pre-wrap break-words">
            Комментарий: {order.comment || "—"}
          </p>
        </section>
        <section className="admin-card space-y-4">
          <h3 className="text-lg">Состав заказа</h3>
          {order.items.map((i) => (
            <div key={i.id} className="border-b border-stone-200 pb-3">
              <p>
                {i.product_name} × {i.quantity}
              </p>
              <p>
                {formatPrice(i.price)} / шт. ·{" "}
                {formatPrice(i.price * i.quantity)}
              </p>
              {i.purchase_mode === "preorder" && (
                <p className="text-sm">
                  Предзаказ · изготовление {i.lead_time_days} дней
                </p>
              )}
            </div>
          ))}
          <strong>Итого: {formatPrice(order.total_amount)}</strong>
        </section>
      </div>
      <form
        className="admin-card grid md:grid-cols-2 gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setMessage("");
            try {
              const result = await updateOrder(form);
              setMessage(result.error ?? "Изменения сохранены");
              if (!result.error) router.refresh();
            } catch {
              setMessage("Не удалось сохранить. Проверьте доступ.");
            }
          });
        }}
      >
        <label>
          Статус заказа
          <select
            className="admin-input"
            value={form.status}
            onChange={(e) => field("status", e.target.value)}
          >
            {Object.entries(orderLabels)
              .filter(([k]) => k !== "in_production")
              .map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
          </select>
        </label>
        <label>
          Статус оплаты
          <select
            className="admin-input"
            value={form.payment_status}
            onChange={(e) => field("payment_status", e.target.value)}
          >
            {Object.entries(paymentLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="md:col-span-2">
          Основание изменения оплаты
          <input
            className="admin-input"
            value={form.reason}
            onChange={(e) => field("reason", e.target.value)}
            placeholder="Например: поступление перевода сверено по выписке"
            maxLength={1000}
          />
        </label>
        <label>
          Трек-номер
          <input
            className="admin-input"
            value={form.tracking_number}
            onChange={(e) => field("tracking_number", e.target.value)}
            maxLength={200}
          />
        </label>
        <label>
          Внутренние заметки
          <textarea
            className="admin-input"
            value={form.internal_notes}
            onChange={(e) => field("internal_notes", e.target.value)}
            rows={4}
            maxLength={5000}
          />
        </label>
        <p className="md:col-span-2 text-sm text-stone-600">
          Отмена освобождает резерв один раз. После отправки возврат остатков
          требует отдельной проверки. Оплата меняется только вручную с
          основанием.
        </p>
        <button disabled={pending} className="admin-button">
          {pending ? "Сохраняю…" : "Сохранить"}
        </button>
        <p role="status" className="self-center">
          {message}
        </p>
      </form>
      <section className="admin-card space-y-3">
        <h3 className="text-lg">Уведомление студии</h3>
        <p>
          {order.notification[0]?.state === "sent"
            ? "Отправлено"
            : order.notification[0]?.state === "failed"
              ? "Ошибка отправки"
              : "Не отправлено или канал не настроен"}
        </p>
        <button
          className="admin-secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                const result = await retryNotification(order.id);
                setMessage(result.error ?? result.message ?? "");
              } catch {
                setMessage("Не удалось проверить уведомление");
              }
            })
          }
        >
          Повторить отправку
        </button>
      </section>
      <section className="admin-card space-y-3">
        <h3 className="text-lg">История изменений</h3>
        {[...order.events]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((e) => (
            <p key={e.id} className="text-sm border-b border-stone-100 pb-2">
              {new Date(e.created_at).toLocaleString("ru-RU", {
                timeZone: "Europe/Moscow",
              })}{" "}
              ·{" "}
              {e.kind === "status"
                ? `Статус: ${orderLabels[e.old_value ?? ""] ?? "—"} → ${orderLabels[e.new_value ?? ""] ?? e.new_value}`
                : e.kind === "payment"
                  ? `Оплата: ${paymentLabels[e.old_value ?? ""]} → ${paymentLabels[e.new_value ?? ""]}`
                  : "Заметки или трек-номер обновлены"}{" "}
              {e.reason && "· " + e.reason}
            </p>
          ))}
        {!order.events.length && (
          <p className="text-sm text-stone-600">
            История до подключения админки не фиксировалась.
          </p>
        )}
      </section>
    </div>
  );
}
