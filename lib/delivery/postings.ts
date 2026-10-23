import { parcelContexts, type DeliveryContext } from "./model";

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
export function postingsFor(context: DeliveryContext) {
  return parcelContexts(context).map((parcel, index) => ({
    ...postingFor(parcel),
    request_id: index + 1,
  }));
}
