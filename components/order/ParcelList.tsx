import { carrierStatusLabel } from "@/lib/delivery/parcel-status";
import { orderedHistory, trackingDate } from "@/lib/delivery/tracking-format";
import {
  parcelProgress,
  type CustomerParcel,
} from "@/lib/delivery/customer-parcels";
export default function ParcelList({
  parcels,
  variant = "default",
}: {
  parcels: CustomerParcel[];
  variant?: "default" | "checkout";
}) {
  return (
    <div className="space-y-3">
      {parcels.length > 1 && (
        <p className="text-stone-600">{parcelProgress(parcels)}</p>
      )}
      {parcels.map((parcel) => (
        <section
          key={parcel.index}
          className={
            variant === "checkout"
              ? "border border-stone-200 p-4 md:p-5 space-y-3"
              : "border border-stone-300/70 p-4 space-y-2"
          }
        >
          <h3
            className={
              variant === "checkout"
                ? "font-body text-copy font-normal text-stone-900"
                : "font-medium"
            }
          >
            Посылка {parcel.index} из {parcel.total}
          </h3>
          <p>{parcel.description}</p>
          <p>{parcel.statusLabel}</p>
          {parcel.deliveryAt && !["delivered", "canceled"].includes(parcel.status ?? "") && (
            <p>Ожидаемая доставка: {trackingDate(parcel.deliveryAt)}.
              {parcel.originalDeliveryAt && trackingDate(parcel.originalDeliveryAt) !== trackingDate(parcel.deliveryAt)
                ? ` Ранее ожидалась ${trackingDate(parcel.originalDeliveryAt)}.` : ""}
              <span className="block text-caption text-stone-500">Предварительная дата Ozon, может измениться.</span>
            </p>
          )}
          {parcel.storageExpiresAt && parcel.status === "in_delivery_point" && (
            <p>Заберите до {trackingDate(parcel.storageExpiresAt, true)} (МСК).</p>
          )}
          {Boolean(parcel.history?.length) && (
            <details>
              <summary className="cursor-pointer text-caption">История доставки</summary>
              <ol className="mt-3 space-y-2 text-caption">
                {orderedHistory(parcel.history ?? []).map((event) => (
                  <li key={`${event.status}:${event.status_changed_at}`}>
                    {carrierStatusLabel(event.status)} · {trackingDate(event.status_changed_at, true)} (МСК)
                  </li>
                ))}
              </ol>
            </details>
          )}
          {parcel.historyPending && <p className="text-caption text-stone-500">История обновляется; текущий статус показан выше.</p>}
          <p className="break-all text-caption text-stone-600">
            Номер отправления:{" "}
            {parcel.number ?? "Появится после оформления отправления"}
          </p>
          {parcel.status === "in_delivery_point" && (
            <p className="text-caption text-stone-600">
              Эту посылку уже можно забрать. Проверьте срок хранения в Ozon.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
