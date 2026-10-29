import {
  packingForParcels,
  type PackingRule,
  type DeliveryContext,
} from "./model";
export type DispatchGroup = "stock" | "preorder";
export function splitDispatchPacking(
  items: DeliveryContext["items"],
  rules: PackingRule[],
  categoryId: string,
): PackingRule {
  const groups: DispatchGroup[] = ["stock", "preorder"];
  if (
    !groups.every((group) =>
      items.some(
        (item) =>
          (item.purchase_mode === "preorder" ? "preorder" : "stock") === group,
      ),
    )
  )
    throw new Error(
      "Раздельная отправка доступна, когда в заказе есть готовые изделия и предзаказ.",
    );
  const parcels = groups.flatMap((group) => {
    const groupItems = items.filter(
      (item) =>
        (item.purchase_mode === "preorder" ? "preorder" : "stock") === group,
    );
    const plan = packingForParcels(groupItems, rules, categoryId);
    return (plan.parcels ?? [{ items: groupItems, packing: plan }]).map(
      (p) => ({ ...p, dispatch_group: group }),
    );
  });
  if (parcels.length > 100)
    throw new Error("В заказе не может быть больше 100 посылок.");
  return { ...parcels[0].packing, split_dispatch: true, parcels };
}
export function groupForRequest(
  packing: PackingRule,
  requestId: number,
): DispatchGroup | undefined {
  return packing.parcels?.[requestId - 1]?.dispatch_group;
}
