import Image from "@/components/ui/StoreImage";
import { orderProductDetails } from "@/lib/order-product-details";
import { customerParcels } from "@/lib/delivery/customer-parcels";
import ParcelList from "@/components/order/ParcelList";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { orderIdForToken, paymentForOrderToken } from "@/lib/order-access";
import { createServerClient } from "@/lib/db";
import { formatPrice } from "@/lib/format-price";
import { customerOrderState } from "@/lib/customer-order-model";
import { seller } from "@/lib/seller";
import {
  COURIER_DESCRIPTION,
  returnInstructionsForVersion,
} from "@/lib/shop-policies";
import { legalArchives } from "@/lib/legal-documents";
import { relationList } from "@/lib/relation-list";
import { ozonTrackingHint } from "@/lib/delivery/tracking";
import PrintConfirmation from "./PrintConfirmation";
import "./print.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Подтверждение покупки — Roota",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const orderId = await orderIdForToken(token);
  if (!orderId) notFound();
  const payment = await paymentForOrderToken(token);
  const { data: order, error } = await createServerClient()
    .from("orders")
    .select(
      "order_number,created_at,customer_name,status,payment_status,delivery_stage,total_amount,delivery_amount,insurance_amount,delivery_type,delivery_address,delivery_details,tracking_number,request_payload,shipments:order_shipments(state,posting_number,status_history,carrier_status,request_payload),items:order_items(id,product_id,product_name,quantity,price,purchase_mode,lead_time_days)",
    )
    .eq("id", orderId)
    .single();
  if (error || !order)
    throw new Error("Не удалось загрузить подтверждение покупки");
  const details = await orderProductDetails(
    order.items.map((item) => item.product_id),
  );
  const shipment = relationList(order.shipments)[0];
  const parcels =
    order.delivery_details?.provider === "ozon"
      ? customerParcels(
          order.delivery_details.packing,
          relationList(order.items),
          shipment,
        )
      : [];
  const state = customerOrderState({
    ...order,
    parcelStatuses: parcels.map((parcel) => parcel.status),
    hasPreorder: order.items.some((i) => i.purchase_mode === "preorder"),
    leadTimeDays: Math.max(0, ...order.items.map((i) => i.lead_time_days ?? 0)),
  });
  const date = (value: string) =>
    new Date(value).toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " МСК";
  const point = order.delivery_details?.point;
  const courier = order.delivery_details?.provider === "yandex";
  const legalVersion = order.request_payload?.form?.legalVersion;
  const delivery =
    Number(order.delivery_amount ?? 0) + Number(order.insurance_amount ?? 0);
  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 pt-28 md:pt-36 pb-20">
      <div className="confirmation-actions flex flex-wrap items-center justify-between gap-5 mb-8">
        <Link
          href={`/order/${token}`}
          prefetch={false}
          className="font-body text-ui underline underline-offset-4"
        >
          ← Вернуться к заказу
        </Link>
        <PrintConfirmation />
      </div>
      <article className="order-confirmation bg-white border border-stone-200 p-6 sm:p-10 md:p-14 font-body text-ui text-stone-800">
        <div className="border-b border-stone-200 pb-8 mb-8">
          <p className="font-display text-price tracking-[0.2em] mb-8">ROOTA</p>
          <p className="text-caption uppercase tracking-widest text-stone-500 mb-3">
            Подтверждение покупки
          </p>
          <h1 className="font-display text-[clamp(1.25rem,3vw,2rem)] leading-snug [overflow-wrap:normal]">
            Заказ № {order.order_number}
          </h1>
          <p className="text-stone-500 mt-3 text-caption">
            Оформлен {date(order.created_at)}
          </p>
          <p className="mt-5">{state.title}</p>
          <p className="text-stone-600 mt-2">{state.detail}</p>
        </div>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Состав покупки</caption>
          <thead>
            <tr className="text-caption text-stone-500">
              <th scope="col" className="font-normal pb-3">
                Изделие
              </th>
              <th scope="col" className="font-normal pb-3 text-right">
                Сумма
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr
                key={item.id}
                className="confirmation-item border-t border-stone-100"
              >
                <td className="py-5 pr-4">
                  <div className="flex items-start gap-4">
                    {details.get(item.product_id ?? "")?.image && (
                      <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden store-media bg-stone-100">
                        <Image
                          src={details.get(item.product_id ?? "")!.image!}
                          alt={item.product_name}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div>
                      {details
                        .get(item.product_id ?? "")
                        ?.title(item.product_name) ?? item.product_name}
                      <p className="text-caption text-stone-500 mt-1">
                        {item.quantity} шт. × {formatPrice(item.price)}
                      </p>
                      {item.purchase_mode === "preorder" && (
                        <p className="text-caption text-stone-500">
                          Предзаказ
                          {item.lead_time_days
                            ? ` · изготовление до ${item.lead_time_days} дней`
                            : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-5 text-right align-top whitespace-nowrap">
                  {formatPrice(item.price * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-stone-200">
              <th scope="row" className="py-5 font-normal">
                Доставка
              </th>
              <td className="text-right whitespace-nowrap">
                {courier ? "Оплачивается отдельно" : formatPrice(delivery)}
              </td>
            </tr>
            <tr className="border-t border-stone-300 text-price">
              <th scope="row" className="py-6 font-normal">
                Итого
              </th>
              <td className="text-right whitespace-nowrap">
                {formatPrice(order.total_amount)}
              </td>
            </tr>
          </tfoot>
        </table>
        {payment?.paid_at && (
          <p className="text-caption text-stone-500">
            Оплата получена {date(payment.paid_at)}
          </p>
        )}
        <section className="confirmation-item bg-stone-50 p-5 sm:p-6 mt-8 space-y-3">
          <h2 className="font-display text-price">Доставка</h2>
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
          {courier && <p className="text-stone-600">{COURIER_DESCRIPTION}</p>}
          <p>Получатель: {order.customer_name}</p>
          {order.delivery_details?.provider === "ozon" ? (
            <ParcelList parcels={parcels} />
          ) : (
            <p className="text-stone-600">
              Номер отправления:{" "}
              {order.tracking_number ||
                (courier
                  ? "Детали отправки сообщим в Telegram"
                  : "Появится после оформления отправления")}
            </p>
          )}
          {order.delivery_details?.provider === "ozon" && (
            <p className="text-caption text-stone-600">
              {ozonTrackingHint(
                shipment?.state === "created" && !!shipment.posting_number,
              )}
            </p>
          )}
        </section>
        <section className="mt-8 pt-6 border-t border-stone-200 space-y-3">
          <h2 className="font-display text-price">Возврат и обращение</h2>
          <p className="text-caption leading-relaxed">
            {returnInstructionsForVersion(legalVersion)}
          </p>
          <Link
            href={
              typeof legalVersion === "string" &&
              Object.hasOwn(legalArchives, legalVersion)
                ? `/documents/${legalVersion}/offer#returns`
                : "/offer#returns"
            }
            className="inline-block underline underline-offset-4"
          >
            Полные условия возврата
          </Link>
          {typeof legalVersion === "string" &&
            Object.hasOwn(legalArchives, legalVersion) && (
              <p>
                <Link
                  href={`/documents/${legalVersion}/offer`}
                  className="underline underline-offset-4"
                >
                  Оферта, принятая при заказе · {legalVersion}
                </Link>
              </p>
            )}
        </section>
        <footer className="confirmation-seller mt-10 pt-6 border-t border-stone-200 text-caption text-stone-500 space-y-2">
          <p>Roota ceramics · Москва</p>
          <p>
            Самозанятая {seller.name} · ИНН {seller.inn}
          </p>
          <a
            className="block underline underline-offset-4"
            href="mailto:hello@roota.moscow"
          >
            hello@roota.moscow
          </a>
          <p className="pt-3">
            Это подтверждение заказа. Фискальный чек Robokassa направляет
            отдельным письмом на email, указанный при оплате.
          </p>
        </footer>
      </article>
    </div>
  );
}
