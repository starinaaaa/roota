import { courierContactLabel } from "@/lib/courier-contact";
import { orderProduction } from "@/lib/shop-operations";
import { plannedReadyDate } from "@/lib/production";
import { gardenProductTitle } from "@/lib/garden-title";
import { customerParcels } from "@/lib/delivery/customer-parcels";
import ParcelList from "@/components/order/ParcelList";
import { relationList } from "@/lib/relation-list";
import type { Metadata } from "next";
import Image from "@/components/ui/StoreImage";
import Link from "next/link";
import { notFound } from "next/navigation";
import { orderIdForToken, paymentForOrderToken } from "@/lib/order-access";
import { createServerClient } from "@/lib/db";
import { customerOrderState, customerOrderSteps } from "@/lib/customer-order-model";
import { formatPrice } from "@/lib/format-price";
import { orderProductDetails } from "@/lib/order-product-details";
import { getSiteContent } from "@/lib/site";
import { paymentExpired } from "@/lib/payments/model";
import { paymentMode } from "@/lib/payments/robokassa";
import OrderPageControls from "@/components/order/OrderPageControls";
import { ozonTrackingHint } from "@/lib/delivery/tracking";

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
  configuration?: import("@/lib/garden").GardenConfiguration | null;
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
  const [orderResult, site] = await Promise.all([
    createServerClient()
      .from("orders")
      .select(
        "order_number,created_at,status,payment_status,total_amount,delivery_amount,insurance_amount,delivery_type,delivery_address,delivery_details,tracking_number,delivery_stage,items:order_items(id,product_id,product_name,quantity,price,purchase_mode,lead_time_days,configuration),shipments:order_shipments(state,posting_number,status_history,request_payload,carrier_status,synced_at)",
      )
      .eq("id", orderId)
      .single(),
    getSiteContent(),
  ]);
  const order = orderResult.data;
  if (orderResult.error || !order)
    throw new Error(
      "Не удалось загрузить заказ. Попробуйте обновить страницу.",
    );
  const items = (order.items as Item[]).map(item => ({
    ...item,
    product_name: item.configuration ? gardenProductTitle(item.product_name) : item.product_name,
  }));
  const leadTimeDays = Math.max(
    0,
    ...items
      .filter((i) => i.purchase_mode === "preorder")
      .map((i) => i.lead_time_days ?? 0),
  );
  const expired = payment ? paymentExpired(payment) : false;
  const canPay =
    payment &&
    payment.status === "pending" &&
    !expired &&
    order.status !== "cancelled" &&
    order.payment_status === "pending" &&
    paymentMode() === "live";
  const shipment = relationList(order.shipments)[0];
  const parcels =
    order.delivery_details?.provider === "ozon"
      ? customerParcels(order.delivery_details?.packing, items, shipment)
      : [];
  const hasPreorder = items.some(i => i.purchase_mode === "preorder");
  const steps = customerOrderSteps(hasPreorder);
  const production = await orderProduction(orderId);
  const leadDays = Math.max(0, ...order.items.filter(i => i.purchase_mode === "preorder").map(i => i.lead_time_days ?? 0));
  const readyOn = production?.task_count ? production.ready_on : plannedReadyDate(payment?.paid_at, leadDays);
  const state = customerOrderState({
    readyOn,
    ...order,
    parcelStatuses: parcels.map((parcel) => parcel.status),
    leadTimeDays: production?.has_unplanned ? 0 : leadTimeDays,
    hasPreorder,
  });
  const tracking = order.tracking_number;
  const point = order.delivery_details?.point;
  const courier = order.delivery_details?.provider === "yandex";
  const contact = new URL(site.telegram);
  contact.searchParams.set(
    "text",
    `Здравствуйте! Вопрос по заказу ${order.order_number}.`,
  );
  const details = await orderProductDetails(
    items.map((item) => item.product_id),
  );
  return (
    <div className="w-full px-6 pb-20 pt-25 md:px-12 md:pt-34 lg:px-16">
      <div className="max-w-4xl space-y-5">
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
          className={`grid grid-cols-2 sm:grid-cols-3 ${hasPreorder ? "lg:grid-cols-7" : "lg:grid-cols-6"} gap-4 my-10 md:my-14`}
        >
          {steps.map((step, index) => (
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
      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-12 xl:gap-16 mt-10 md:mt-14">
        <section aria-labelledby="order-items" className="min-w-0">
          <h2
            id="order-items"
            className="font-display text-price text-stone-900 mb-7 md:mb-8"
          >
            Ваши изделия
          </h2>
          {items.map((item) => {
            const image = item.product_id
              ? details.get(item.product_id)?.image
              : null;
            return (
              <article
                key={item.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-5 border-b border-stone-200 first-of-type:pt-0 last:border-b-0 md:gap-x-5"
              >
                <div className="relative row-span-2 sm:row-span-1 aspect-square w-20 md:w-24 shrink-0 overflow-hidden store-media bg-stone-100">
                  {image ? (
                    <Image
                      src={image}
                      alt={
                        details
                          .get(item.product_id ?? "")
                          ?.title(item.product_name) ?? item.product_name
                      }
                      fill
                      sizes="(min-width: 768px) 96px, 80px"
                      className="object-contain"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-stone-400 font-display text-ui">
                      Roota
                    </span>
                  )}
                </div>
                <div className="min-w-0 font-body text-ui space-y-1">
                  <h3 className="font-body font-normal text-copy text-stone-900 break-words">
                    {details
                      .get(item.product_id ?? "")
                      ?.title(item.product_name) ?? item.product_name}
                  </h3>
                  <p className="text-stone-600">
                    {item.quantity} шт. × {formatPrice(item.price)}
                  </p>
                  {item.purchase_mode === "preorder" && (
                    <p className="text-stone-600">
                      Предзаказ
                      {item.lead_time_days
                        ? ` · изготовление до ${item.lead_time_days} дней`
                        : " · срок изготовления уточним"}
                    </p>
                  )}
                </div>
                <p className="col-start-2 sm:col-start-auto font-body text-copy text-stone-900 tabular-nums whitespace-nowrap sm:text-right">
                  {formatPrice(item.price * item.quantity)}
                </p>
              </article>
            );
          })}
          {!items.length && (
            <p className="font-body text-ui text-stone-600">
              Состав этого заказа уточните у студии.
            </p>
          )}
        </section>
        <aside className="min-w-0 space-y-7 md:space-y-8 self-start font-body text-ui">
          <section className="space-y-5">
            <h2 className="font-display text-price text-stone-900">Доставка</h2>
            <p>
              {point?.name ||
                (courier
                  ? "Курьер Яндекс Доставки"
                  : order.delivery_type === "pickup"
                    ? "Самовывоз"
                    : "Доставка")}
            </p>
            <p className="text-stone-600">
              {point?.address || order.delivery_address}
            </p>
            {courier && (
              <p className="text-stone-600">
                Напишем в течение суток ({courierContactLabel(order.delivery_details)}) и согласуем стоимость и
                удобное время доставки до двери по Москве и Подмосковью. Курьера
                вы оплачиваете отдельно в приложении.
              </p>
            )}
            {parcels.length > 0 ? (
              <ParcelList parcels={parcels} variant="checkout" />
            ) : tracking ? (
              <p className="break-all">Номер отправления: {tracking}</p>
            ) : null}
            {order.delivery_details?.provider === "ozon" && (
              <p className="text-caption text-stone-600">
                {ozonTrackingHint(
                  shipment?.state === "created" && !!shipment.posting_number,
                )}
              </p>
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
          <section className="space-y-4 border-t border-stone-200 pt-6 md:pt-7">
            <div className="flex justify-between gap-6 text-copy text-stone-600">
              <span>Изделия</span>
              <span className="text-stone-900 tabular-nums whitespace-nowrap">
                {formatPrice(
                  items.length
                    ? items.reduce((sum, i) => sum + i.quantity * i.price, 0)
                    : Number(order.total_amount) -
                        Number(order.delivery_amount ?? 0) -
                        Number(order.insurance_amount ?? 0),
                )}
              </span>
            </div>
            <div className="flex justify-between gap-6 text-copy text-stone-600">
              <span>Доставка</span>
              <span className="text-right tabular-nums">
                {courier
                  ? "Оплачивается отдельно"
                  : formatPrice(
                      Number(order.delivery_amount ?? 0) +
                        Number(order.insurance_amount ?? 0),
                    )}
              </span>
            </div>
            <div className="flex justify-between items-baseline gap-5 border-t border-stone-200 pt-6 md:pt-7">
              <span className="text-ui tracking-[0.08em] uppercase text-stone-600">
                Итого
              </span>
              <span className="font-display text-[2rem] leading-none md:text-section text-stone-900 tabular-nums whitespace-nowrap">
                {formatPrice(order.total_amount)}
              </span>
            </div>
          </section>
          <a
            href={contact.toString()}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center border border-stone-900 px-6 py-4 text-ui uppercase tracking-wider transition-colors hover:bg-stone-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4"
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
