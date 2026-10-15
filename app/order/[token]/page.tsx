import { relationList } from "@/lib/relation-list";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { orderIdForToken, paymentForOrderToken } from "@/lib/order-access";
import { createServerClient } from "@/lib/db";
import { customerOrderState, orderSteps } from "@/lib/customer-order-model";
import { formatPrice } from "@/lib/format-price";
import { getProducts } from "@/lib/products";
import { getSiteContent } from "@/lib/site";
import { paymentExpired } from "@/lib/payments/model";
import { paymentMode } from "@/lib/payments/robokassa";
import OrderPageControls from "@/components/order/OrderPageControls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ваш заказ — Roota",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};
type Item = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  price: number;
  purchase_mode: string;
  lead_time_days: number | null;
};
export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const orderId = await orderIdForToken(token);
  if (!orderId) notFound();
  // Also expires the reservation before rendering the order's current state.
  const payment = await paymentForOrderToken(token);
  const [orderResult, site, products] = await Promise.all([
    createServerClient()
      .from("orders")
      .select(
        "order_number,created_at,status,payment_status,total_amount,delivery_amount,insurance_amount,delivery_type,delivery_address,delivery_details,tracking_number,delivery_stage,items:order_items(id,product_id,product_name,quantity,price,purchase_mode,lead_time_days),shipments:order_shipments(posting_number,carrier_status,synced_at)",
      )
      .eq("id", orderId)
      .single(),
    getSiteContent(),
    getProducts(),
  ]);
  const order = orderResult.data;
  if (orderResult.error || !order)
    throw new Error(
      "Не удалось загрузить заказ. Попробуйте обновить страницу.",
    );
  const items = order.items as Item[];
  const leadTimeDays = Math.max(
    0,
    ...items
      .filter((i) => i.purchase_mode === "preorder")
      .map((i) => i.lead_time_days ?? 0),
  );
  const state = customerOrderState({
    ...order,
    leadTimeDays,
    hasPreorder: items.some((i) => i.purchase_mode === "preorder"),
  });
  const expired = payment ? paymentExpired(payment) : false;
  const canPay =
    payment &&
    payment.status === "pending" &&
    !expired &&
    order.status !== "cancelled" &&
    order.payment_status === "pending" &&
    paymentMode() === "live";
  const shipment = relationList(order.shipments)[0];
  const tracking = order.tracking_number || shipment?.posting_number;
  const point = order.delivery_details?.point;
  const contact = new URL(site.telegram);
  contact.searchParams.set(
    "text",
    `Здравствуйте! Вопрос по заказу ${order.order_number}.`,
  );
  const imageByProduct = new Map(
    products.map((p) => [p.id, p.primary_image_url]),
  );
  return (
    <div className="pt-28 md:pt-36 pb-20 px-6 md:px-12 max-w-6xl mx-auto">
      <div className="max-w-3xl space-y-5">
        <p className="font-body text-copy uppercase tracking-wide text-stone-600">
          Заказ № {order.order_number}
        </p>
        <h1 className="font-display text-page leading-tight">{state.title}</h1>
        <p className="font-body text-copy text-stone-700 leading-relaxed">
          {state.detail}
        </p>
        {payment?.expires_at &&
          !expired &&
          order.payment_status === "pending" &&
          order.status !== "cancelled" && (
            <p className="font-body text-ui text-stone-600">
              Резерв до{" "}
              {new Date(payment.expires_at).toLocaleString("ru-RU", {
                timeZone: "Europe/Moscow",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              (МСК).
            </p>
          )}
        {canPay && (
          <Link
            href={`/order/${token}/pay`}
            prefetch={false}
            className="inline-block bg-stone-900 text-white px-8 py-4 font-body text-ui"
          >
            Оплатить заказ
          </Link>
        )}
        <OrderPageControls confirmationUrl={`/order/${token}/confirmation`} />
        <p className="font-body text-caption text-stone-500">
          Сохраните персональную ссылку: по ней можно вернуться к заказу без
          регистрации.
        </p>
      </div>
      {state.step >= 0 && (
        <ol
          aria-label="Этапы заказа"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 my-10 md:my-14"
        >
          {orderSteps.map((step, index) => (
            <li
              key={step}
              aria-current={index === state.step ? "step" : undefined}
              className={`border-t-2 pt-3 font-body text-ui ${index <= state.step ? "border-stone-900 text-stone-900" : "border-stone-200 text-stone-500"}`}
            >
              <span className="block text-caption mb-2">
                {index < state.step ? "✓" : String(index + 1).padStart(2, "0")}
              </span>
              {step}
            </li>
          ))}
        </ol>
      )}
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-10 mt-10">
        <section aria-labelledby="order-items" className="space-y-5">
          <h2 id="order-items" className="font-display text-section">
            Ваши изделия
          </h2>
          {items.map((item) => {
            const image = item.product_id
              ? imageByProduct.get(item.product_id)
              : null;
            return (
              <article
                key={item.id}
                className="flex gap-4 border-b border-stone-200 pb-5"
              >
                <div className="relative w-24 h-28 sm:w-28 sm:h-32 shrink-0 bg-stone-100">
                  {image ? (
                    <Image
                      src={image}
                      alt={item.product_name}
                      fill
                      sizes="112px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-stone-400 font-display text-ui">
                      Roota
                    </span>
                  )}
                </div>
                <div className="flex-1 font-body text-ui space-y-2">
                  <h3 className="text-stone-900">{item.product_name}</h3>
                  <p className="text-stone-600">
                    {item.quantity} шт. × {formatPrice(item.price)}
                  </p>
                  <p>{formatPrice(item.price * item.quantity)}</p>
                  {item.purchase_mode === "preorder" && (
                    <p className="text-stone-600">
                      Предзаказ
                      {item.lead_time_days
                        ? ` · изготовление до ${item.lead_time_days} дней`
                        : " · срок изготовления уточним"}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
          {!items.length && (
            <p className="font-body text-ui text-stone-600">
              Состав этого заказа уточните у студии.
            </p>
          )}
        </section>
        <aside className="bg-stone-100 p-6 md:p-8 space-y-7 self-start font-body text-ui">
          <section className="space-y-3">
            <h2 className="font-display text-section">Доставка</h2>
            <p>
              {point?.name ||
                (order.delivery_type === "pickup" ? "Самовывоз" : "Доставка")}
            </p>
            <p className="text-stone-600">
              {point?.address || order.delivery_address}
            </p>
            {tracking && (
              <div className="space-y-2">
                <p className="text-caption text-stone-500">Номер отправления</p>
                <p className="break-all">{tracking}</p>
                {order.delivery_details?.provider === "ozon" && (
                  <a
                    href="https://www.ozon.ru/my/orderlist"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block underline underline-offset-4"
                  >
                    Открыть заказы в Ozon ↗
                  </a>
                )}
                <p className="text-caption text-stone-500">
                  Актуальный статус доставки отображается на этой странице.
                </p>
              </div>
            )}
            {shipment?.synced_at && (
              <p className="text-caption text-stone-500">
                Доставка обновлена:{" "}
                {new Date(shipment.synced_at).toLocaleString("ru-RU", {
                  timeZone: "Europe/Moscow",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                (МСК)
              </p>
            )}
          </section>
          <section className="space-y-3 border-t border-stone-200 pt-6">
            <div className="flex justify-between gap-3">
              <span>Изделия</span>
              <span>
                {formatPrice(
                  items.length
                    ? items.reduce((sum, i) => sum + i.quantity * i.price, 0)
                    : Number(order.total_amount) -
                        Number(order.delivery_amount ?? 0) -
                        Number(order.insurance_amount ?? 0),
                )}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Доставка</span>
              <span>
                {formatPrice(
                  Number(order.delivery_amount ?? 0) +
                    Number(order.insurance_amount ?? 0),
                )}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-copy border-t border-stone-200 pt-4">
              <span>Итого</span>
              <span>{formatPrice(order.total_amount)}</span>
            </div>
          </section>
          <a
            href={contact.toString()}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center border border-stone-400 px-4 py-3"
          >
            Написать по заказу ↗
          </a>
          <p className="text-caption text-stone-500">
            Ответ — в течение рабочего дня.
          </p>
        </aside>
      </div>
    </div>
  );
}
