import "server-only";
import { OzonTransport, activeShipmentMethod } from "./ozon-transport";
import {
  moneyToKopecks,
  type DeliveryAdapter,
  type DeliveryContext,
} from "./model";
export function ozonConfigured() {
  return Boolean(process.env.OZON_CLIENT_ID && process.env.OZON_CLIENT_SECRET);
}
let cachedTransport: OzonTransport | undefined;
export function ozonTransport() {
  if (!ozonConfigured())
    throw new Error("Доставка временно недоступна. Свяжитесь со студией.");
  return (cachedTransport ??= new OzonTransport(
    process.env.OZON_CLIENT_ID!,
    process.env.OZON_CLIENT_SECRET!,
  ));
}
export async function shipmentMethodId(): Promise<number> {
  const id = await activeShipmentMethod(
    ozonTransport(),
    process.env.OZON_SHIPMENT_METHOD_ID,
  );
  console.info("Ozon Delivery: active shipment method", id);
  return id;
}
export function postingFor(context: DeliveryContext) {
  const p = context.packing;
  return {
    request_id: 1,
    shipment_method_id: context.shipmentMethodId,
    ...(context.cutoffAt ? { cutoff_at: context.cutoffAt } : {}),
    declared_value: {
      amount: context.items
        .reduce((sum, i) => sum + i.price * i.quantity, 0)
        .toFixed(2),
      currency_code: "RUB",
    },
    dimensions: {
      weight_g: p.weight_g,
      length_mm: p.length_mm,
      width_mm: p.width_mm,
      height_mm: p.height_mm,
    },
  };
}
type Result = {
  request_id: number;
  delivery_point_id?: number;
  error?: unknown;
  posting?: {
    estimated_delivery_cost?: { amount: string; currency_code: string };
    estimated_insurance_cost?: { amount: string; currency_code: string };
    estimated_delivery_days?: number | null;
  };
};
export const ozon: DeliveryAdapter = {
  id: "ozon",
  methods: ["point"],
  async checkRecipient(phone) {
    const data = await ozonTransport().call<{ can_be_delivered: boolean }>(
      "/v1/delivery/check-client",
      { phone_number: phone },
    );
    if (data.can_be_delivered !== true)
      throw new Error(
        "Ozon не может доставить заказ по этому номеру. Укажите телефон вашего аккаунта Ozon.",
      );
  },
  async checkPoints(ids, context) {
    if (!ids.length) return [];
    const data = await ozonTransport().call<{ results: Result[] }>(
      "/v1/delivery-point/check-availability",
      {
        delivery_point_ids: ids,
        shipment_method_id: context.shipmentMethodId,
        postings: [postingFor(context)],
      },
    );
    if (!Array.isArray(data.results))
      throw new Error("Не удалось проверить пункты выдачи.");
    return data.results
      .filter(
        (r) =>
          r.request_id === 1 && !r.error && ids.includes(r.delivery_point_id!),
      )
      .map((r) => r.delivery_point_id!);
  },
  async quote(pointId, context) {
    const data = await ozonTransport().call<{ results: Result[] }>(
      "/v1/order/checkout",
      {
        recipient: { phone_number: context.phone },
        postings: [postingFor(context)],
        delivery: { delivery_point: { delivery_point_id: pointId } },
      },
    );
    const r = data.results?.find((r) => r.request_id === 1);
    if (!r || r.error || !r.posting)
      throw new Error(
        "Доставка в этот пункт недоступна для вашего заказа. Выберите другой пункт.",
      );
    const delivery = r.posting.estimated_delivery_cost,
      insurance = r.posting.estimated_insurance_cost;
    if (delivery?.currency_code !== "RUB" || insurance?.currency_code !== "RUB")
      throw new Error(
        "Не удалось получить стоимость доставки и страховки. Повторите расчёт.",
      );
    return {
      deliveryCost: moneyToKopecks(delivery.amount) / 100,
      insuranceCost: moneyToKopecks(insurance.amount) / 100,
      estimatedDays:
        context.cutoffAt &&
        Number.isInteger(r.posting.estimated_delivery_days) &&
        Number(r.posting.estimated_delivery_days) >= 0
          ? r.posting.estimated_delivery_days!
          : null,
    };
  },
};
export type OzonPointInfo = {
  delivery_point_id: number;
  name: string;
  full_address: string;
  is_active: boolean;
  type: string;
  schedule?: {
    date: string;
    periods: { from_local: string; to_local: string }[];
  }[];
};
export async function pointInfo(ids: number[]) {
  const result = await ozonTransport().call<{
    delivery_points: OzonPointInfo[];
  }>("/v1/delivery-point/info", { delivery_point_ids: ids });
  if (!Array.isArray(result.delivery_points))
    throw new Error("Не удалось получить пункты выдачи.");
  return result.delivery_points;
}
