import Link from "next/link";
import { notFound } from "next/navigation";
import { getTestOrder } from "@/lib/admin-data";
import { formatPrice } from "@/lib/products";
import { paymentLabels } from "@/lib/validation";

const date = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
  });

export default async function TestOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const order = await getTestOrder((await params).id);
  if (!order) notFound();
  const payment = order.payment;
  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="admin-secondary">
        ← Все заказы
      </Link>
      <div className="admin-card space-y-2">
        <h2 className="text-xl">TEST-{payment?.inv_id ?? order.id}</h2>
        <p className="text-amber-800">
          Тестовый заказ · деньги не списываются, товар не резервируется,
          отправка не создаётся.
        </p>
        <p className="text-sm text-stone-600">
          Создан: {date(order.created_at)}
        </p>
        <p>
          Оплата: {payment ? paymentLabels[payment.status] : "Платёж не найден"}
        </p>
        {payment?.paid_at && (
          <p>Подтверждена Robokassa: {date(payment.paid_at)}</p>
        )}
        {payment?.status === "pending" && (
          <p className="text-sm text-stone-600">
            Подтверждение от Robokassa ещё не получено. Выбор способа оплаты и
            возврат на сайт сами по себе не меняют статус.
          </p>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <section className="admin-card space-y-2">
          <h3 className="text-lg">Покупатель</h3>
          <p>{order.form.name ?? "—"}</p>
          <p>{order.form.phone ?? "—"}</p>
          <p className="break-all">{order.form.email ?? "—"}</p>
          {order.form.comment && (
            <p className="whitespace-pre-wrap">{order.form.comment}</p>
          )}
        </section>
        <section className="admin-card space-y-2">
          <h3 className="text-lg">Выбранная доставка</h3>
          {order.delivery.point ? (
            <>
              <p>{order.delivery.city}</p>
              <p>{order.delivery.point.name}</p>
              <p>{order.delivery.point.address}</p>
              <p className="text-sm text-stone-600">
                ПВЗ: {order.delivery.point.id}
              </p>
              <p>
                Доставка: {formatPrice(order.delivery.delivery_amount ?? 0)}
              </p>
              <p>
                Страхование: {formatPrice(order.delivery.insurance_amount ?? 0)}
              </p>
            </>
          ) : (
            <p>Данные ПВЗ в этом заказе не сохранены.</p>
          )}
        </section>
      </div>
      <section className="admin-card space-y-4">
        <h3 className="text-lg">Состав на момент оформления</h3>
        {order.items.map((item, index) => (
          <div
            key={index}
            className="flex flex-wrap justify-between gap-2 border-b border-stone-200 pb-3"
          >
            <p>
              {item.name} · {item.quantity} шт.
            </p>
            <p>{formatPrice(item.sum)}</p>
          </div>
        ))}
        <p>
          Всего с доставкой: <strong>{formatPrice(order.amount)}</strong>
        </p>
      </section>
    </div>
  );
}
