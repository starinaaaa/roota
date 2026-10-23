import { ozonCheckoutError } from "./checkout-errors";
import type { OzonTransport } from "./ozon-transport";
import {
  estimatedDeliveryDays,
  moneyToKopecks,
  type DeliveryAdapter,
} from "./model";
import { postingsFor } from "./postings";

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
export function createOzonAdapter(
  transport: Pick<OzonTransport, "call">,
): DeliveryAdapter {
  return {
    id: "ozon",
    methods: ["point"],
    async checkRecipient(phone) {
      const data = await transport.call<{ can_be_delivered: boolean }>(
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
      const data = await transport.call<{ results: Result[] }>(
        "/v1/delivery-point/check-availability",
        {
          delivery_point_ids: ids,
          shipment_method_id: context.shipmentMethodId,
          postings: postingsFor(context),
        },
      );
      if (!Array.isArray(data.results))
        throw new Error("Не удалось проверить пункты выдачи.");
      const postings = postingsFor(context);
      return ids.filter((id) =>
        postings.every((posting) =>
          data.results.some(
            (r) =>
              r.delivery_point_id === id &&
              r.request_id === posting.request_id &&
              !r.error,
          ),
        ),
      );
    },
    async quote(pointId, context) {
      const data = await transport.call<{ results: Result[] }>(
        "/v1/order/checkout",
        {
          recipient: { phone_number: context.phone },
          postings: postingsFor(context),
          delivery: { delivery_point: { delivery_point_id: pointId } },
        },
      );
      const costs = postingsFor(context).map((posting) => {
        const r = data.results?.find(
          (r) => r.request_id === posting.request_id,
        );
        if (!r || r.error || !r.posting) {
          const rawCode =
            r?.error && typeof r.error === "object" && "code" in r.error
              ? r.error.code
              : "unknown";
          const code =
            typeof rawCode === "string" && /^[a-zA-Z0-9_]{1,80}$/.test(rawCode)
              ? rawCode
              : "unknown";
          const goodsAmount = context.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
          );
          console.warn("Ozon checkout rejected", {
            code,
            goodsAmount,
            pointId,
            shipmentMethodId: context.shipmentMethodId,
          });
          throw new Error(ozonCheckoutError(code, goodsAmount));
        }
        const delivery = r.posting.estimated_delivery_cost,
          insurance = r.posting.estimated_insurance_cost;
        if (
          delivery?.currency_code !== "RUB" ||
          insurance?.currency_code !== "RUB"
        )
          throw new Error(
            "Не удалось получить стоимость доставки. Повторите расчёт.",
          );
        return {
          deliveryCost: moneyToKopecks(delivery.amount) / 100,
          insuranceCost: moneyToKopecks(insurance.amount) / 100,
          estimatedDays: estimatedDeliveryDays(
            r.posting.estimated_delivery_days,
          ),
        };
      });
      return {
        deliveryCost:
          Math.round(
            costs.reduce((sum, cost) => sum + cost.deliveryCost, 0) * 100,
          ) / 100,
        insuranceCost:
          Math.round(
            costs.reduce((sum, cost) => sum + cost.insuranceCost, 0) * 100,
          ) / 100,
        estimatedDays: costs.some((cost) => cost.estimatedDays === null)
          ? null
          : Math.max(...costs.map((cost) => cost.estimatedDays!)),
      };
    },
  };
}
