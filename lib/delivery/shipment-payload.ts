import { parcelContexts, type DeliveryContext } from "./model";
import { postingsFor } from "./postings";
import { gardenKey } from "@/lib/garden";
import {
  shipmentDescription,
  type ShipmentCategory,
} from "./shipment-description";
export type ShipmentItem = DeliveryContext["items"][number] & {
  product_name: string;
  category?: ShipmentCategory | null;
};
export function shipmentPayload(
  order: {
    order_number: string;
    customer_phone: string;
    customer_name: string;
  },
  pointId: number,
  context: DeliveryContext,
  items: ShipmentItem[],
  revision?: string,
) {
  const parcels = parcelContexts(context);
  return {
    order_external_id: order.order_number,
    recipient: {
      phone_number: order.customer_phone,
      full_name: order.customer_name,
    },
    delivery: { delivery_point: { delivery_point_id: pointId } },
    postings: postingsFor(context).map((posting, index) => ({
      ...posting,
      posting_external_id: `${order.order_number}-${index + 1}${revision ? `-${revision}` : ""}`,
      description: shipmentDescription(
        parcels[index].items.map((item) => {
          const original = items.find(
            (i) =>
              i.product_id === item.product_id &&
              i.purchase_mode === item.purchase_mode &&
              (!item.configuration || (i.configuration && gardenKey(i.configuration) === gardenKey(item.configuration))),
          );
          if (!original)
            throw new Error("Состав посылки не соответствует заказу.");
          return {
            product_name: original.product_name,
            quantity: item.quantity,
            category: original.category,
          };
        }),
      ),
    })),
  };
}
