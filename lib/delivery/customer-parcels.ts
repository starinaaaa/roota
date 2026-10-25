import { gardenProductTitle } from "@/lib/garden-title";
import {
  carrierStatusLabel,
  shipmentPostings,
  type CarrierPosting,
} from "./parcel-status";
import type { PackingRule } from "./model";
import { gardenKey, type GardenConfiguration } from "@/lib/garden";
export type CustomerParcel = {
  index: number;
  total: number;
  number: string | null;
  description: string;
  status: string | null;
  statusLabel: string;
};
type Item = {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  purchase_mode?: string;
  configuration?: GardenConfiguration | null;
};
type Shipment = {
  state?: string;
  posting_number?: string | null;
  carrier_status?: string | null;
  status_history?: { postings?: CarrierPosting[] } | null;
  request_payload?: {
    postings?: { request_id: number; description?: string }[];
  } | null;
};
export function customerParcels(
  packing: PackingRule | null | undefined,
  items: Item[],
  shipment?: Shipment | null,
): CustomerParcel[] {
  const postings = shipmentPostings(shipment ?? {});
  const requests = shipment?.request_payload?.postings ?? [];
  const total = Math.max(
    packing?.parcels?.length ?? 0,
    requests.length,
    postings.length,
    1,
  );
  return Array.from({ length: total }, (_, i) => {
    const index = i + 1;
    const posting = postings.find((p) => p.request_id === index);
    const request = requests.find((p) => p.request_id === index);
    const contents = packing?.parcels?.[i]?.items;
    const gardenParcel = contents
      ? contents.some(item => item.configuration)
      : total === 1 && items.some(item => item.configuration);
    const description =
      (!gardenParcel && request?.description) ||
      (contents
        ? contents
            .map((item) => {
              const original = items.find(
                (original) =>
                  original.product_id === item.product_id &&
                  (!original.purchase_mode ||
                    original.purchase_mode === item.purchase_mode) &&
                  (!item.configuration || (original.configuration && gardenKey(original.configuration) === gardenKey(item.configuration))),
              );
              const title = original?.product_name ?? "Изделие";
              return `${original?.configuration ? gardenProductTitle(title) : title} × ${item.quantity}`;
            })
            .join("; ")
        : total === 1
          ? items
              .map((item) => `${item.configuration ? gardenProductTitle(item.product_name) : item.product_name} × ${item.quantity}`)
              .join("; ")
          : "Состав уточняется у студии");
    const status =
      posting?.status ??
      (total === 1 ? shipment?.carrier_status : null) ??
      (posting && shipment?.state === "created" ? "created" : null);
    return {
      index,
      total,
      number: posting?.posting_number ?? null,
      description,
      status,
      statusLabel: carrierStatusLabel(status),
    };
  });
}
export function parcelProgress(parcels: CustomerParcel[]) {
  if (parcels.length < 2) return "";
  const pickup = parcels.filter((p) => p.status === "in_delivery_point").length;
  const delivered = parcels.filter((p) => p.status === "delivered").length;
  if (delivered === parcels.length) return "Все посылки получены.";
  const parts = [
    `Заказ отправляется ${parcels.length} посылками. Они могут приехать в разные дни.`,
  ];
  if (pickup) parts.push(`Можно забрать: ${pickup} из ${parcels.length}.`);
  if (delivered) parts.push(`Получено: ${delivered} из ${parcels.length}.`);
  return parts.join(" ");
}
export function deliveryEmailUpdate(
  kind: string,
  number: string,
  parcels: CustomerParcel[],
  postingNumber?: string,
) {
  const parcel = postingNumber
    ? parcels.find((p) => p.number === postingNumber)
    : undefined;
  const label = parcel
    ? `Посылка ${parcel.index} из ${parcel.total} по заказу ${number}`
    : `Заказ ${number}`;
  const action =
    kind === "order_shipped"
      ? "отправлен"
      : kind === "order_pickup"
        ? "можно забирать"
        : "получен";
  const subject = parcel
    ? `${label}: ${kind === "order_shipped" ? "в пути" : kind === "order_pickup" ? "можно забирать" : "получена"}`
    : `${label} ${action}`;
  const message = parcel
    ? kind === "order_pickup"
      ? `${label} поступила в пункт Ozon. Её уже можно забрать, не дожидаясь остальных посылок. Проверьте срок хранения в Ozon.`
      : `${label} передана Ozon и направляется в ваш пункт выдачи.`
    : kind === "order_delivered"
      ? "Все изделия из вашего заказа получены. Спасибо, что выбрали Roota!"
      : kind === "order_pickup"
        ? "Ваш заказ поступил в пункт Ozon. Проверьте срок хранения перед получением."
        : "Ваш заказ передан Ozon. Подробности по каждой посылке — ниже и на странице заказа.";
  return { subject, message };
}
