import {
  returnAttention,
  returnStatusLabel,
  type ReturnEvent,
} from "@/lib/delivery/return-model";
import { trackingDate } from "@/lib/delivery/tracking-format";
import type { StoredCarrierReturn } from "@/lib/delivery/returns-data";
export default function CarrierReturns({
  returns,
}: {
  returns: StoredCarrierReturn[];
}) {
  return (
    <div className="space-y-3">
      {returns.map((item) => (
        <article
          key={item.return_number}
          className={`border p-4 space-y-2 ${returnAttention(item.status) ? "border-amber-600 bg-amber-50" : "border-stone-200"}`}
        >
          <h3 className="font-medium">{returnStatusLabel(item.status)}</h3>
          <p>Возвратное отправление: {item.return_number}</p>
          {item.current_placement_name && (
            <p>Последний объект Ozon: {item.current_placement_name}</p>
          )}
          {item.current_placement_address && (
            <p>{item.current_placement_address}</p>
          )}
          {item.cancellation_reason && (
            <p>Причина Ozon: {item.cancellation_reason}</p>
          )}
          <p>
            Событие: {trackingDate(String(item.status_changed_at), true)} (МСК).
          </p>
          {["at_pickup_point", "at_the_pick_up_point"].includes(
            item.status,
          ) && (
            <p role="status">
              Заберите возврат как можно скорее. По условиям Ozon хранение
              платное со второго дня; после 10 дней возможна утилизация. Точный
              срок проверьте в кабинете Ozon.
            </p>
          )}
          <p className="text-sm text-stone-600">
            Проверено: {trackingDate(String(item.synced_at), true)} (МСК).
            Указан последний известный объект, а не координаты посылки.
          </p>
          {item.history.length > 0 && (
            <details>
              <summary className="cursor-pointer">История возврата</summary>
              <ol className="mt-2 space-y-1 text-sm">
                {[...item.history]
                  .sort(
                    (a: ReturnEvent, b: ReturnEvent) =>
                      Date.parse(a.changed_at) - Date.parse(b.changed_at),
                  )
                  .map((event) => (
                    <li key={`${event.return_status}:${event.changed_at}`}>
                      {returnStatusLabel(event.return_status)} ·{" "}
                      {trackingDate(event.changed_at, true)} (МСК)
                    </li>
                  ))}
              </ol>
            </details>
          )}
          {item.history_error && (
            <p className="text-sm">
              Историю пока не удалось обновить. Повторим проверку автоматически.
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
