import { gardenCount, type GardenConfiguration } from "@/lib/garden";

export type Dimensions = {
  weight_g: number;
  length_mm: number;
  width_mm: number;
  height_mm: number;
};
export type PackingRule = Dimensions & {
  id: string;
  name: string;
  composition: { category_id: string; quantity: number }[];
  active: boolean;
  garden_size?: number | null;
  updated_at: string;
  split_dispatch?: boolean;
  delivery_packaging_fee?: number;
  delivery_packaging_fee_per_parcel?: number;
  dispatch_costs?: { request_id: number; deliveryCost: number; insuranceCost: number }[];
  parcels?: { items: DeliveryContext["items"]; packing: PackingRule; dispatch_group?: "stock" | "preorder"; cutoff_at?: string }[];
};
export const PACKAGING_FEE_PER_PARCEL = 250;
export function packagingFeeFor(packing: PackingRule) {
  const count = packing.parcels?.length ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error("Не удалось определить количество посылок для упаковки.");
  return PACKAGING_FEE_PER_PARCEL * count;
}
export type DeliveryPoint = {
  id: number;
  name: string;
  address: string;
  schedule?: string;
  coordinates?: { latitude: number; longitude: number };
};
export type DeliveryQuote = {
  id: string;
  deliveryCost: number;
  insuranceCost: number;
  totalCost: number;
  parcelCount?: number;
  packagingFee?: number;
  estimatedDays: number | null;
  expiresAt: string;
  point: DeliveryPoint;
};
export function estimatedDeliveryDays(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export function deliveryEstimateLabel(days: number | null): string {
  const estimate = estimatedDeliveryDays(days);
  return estimate === null
    ? "Срок доставки пока не рассчитан. Уточните его у студии до оплаты."
    : `Ориентировочный срок доставки: ${estimate} дн. после передачи заказа Ozon.`;
}

export type DeliveryContext = {
  phone: string;
  items: {
    product_id: string;
    category_id: string;
    quantity: number;
    price: number;
    purchase_mode: string;
    configuration?: GardenConfiguration | null;
    line_id?: string;
  }[];
  packing: PackingRule;
  shipmentMethodId: number;
  cutoffAt?: string;
};
export interface DeliveryAdapter {
  id: string;
  methods: readonly ("point" | "courier")[];
  checkRecipient(phone: string): Promise<void>;
  checkPoints(ids: number[], context: DeliveryContext): Promise<number[]>;
  quote(
    pointId: number,
    context: DeliveryContext,
  ): Promise<{
    deliveryCost: number;
    insuranceCost: number;
    estimatedDays: number | null;
    parcelCosts?: { request_id: number; deliveryCost: number; insuranceCost: number }[];
  }>;
}
export function packingFor(
  items: DeliveryContext["items"],
  rules: PackingRule[],
): PackingRule {
  const counts = new Map<string, number>();
  for (const item of items)
    counts.set(
      item.category_id,
      (counts.get(item.category_id) ?? 0) + item.quantity,
    );
  const matches = rules.filter(
    (rule) =>
      rule.active &&
      !rule.garden_size &&
      rule.composition.length === counts.size &&
      rule.composition.every((i) => counts.get(i.category_id) === i.quantity),
  );
  if (matches.length !== 1)
    throw new Error(
      "Для этого состава заказа упаковка ещё не настроена. Свяжитесь со студией.",
    );
  return matches[0];
}
// Only plates use the two-per-box policy. Other compositions still require an exact rule.
export function packingForParcels(
  items: DeliveryContext["items"],
  rules: PackingRule[],
  plateCategoryId: string,
): PackingRule {
  const gardens = items.filter(item => item.configuration);
  if (gardens.length) {
    const parcels: NonNullable<PackingRule["parcels"]> = gardens.map(item => {
      const count = gardenCount(item.configuration!);
      const candidates = rules.filter(rule => rule.active && rule.garden_size && rule.garden_size >= count).sort((a, b) => a.garden_size! - b.garden_size!);
      const packing = candidates[0];
      if (!packing || candidates[1]?.garden_size === packing.garden_size)
        throw new Error("Для этого размера сада упаковка ещё не настроена. Свяжитесь со студией.");
      return { items: [item], packing };
    });
    const rest = items.filter(item => !item.configuration);
    if (rest.length) {
      const other = packingForParcels(rest, rules, plateCategoryId);
      parcels.push(...(other.parcels ?? [{ items: rest, packing: other }]));
    }
    if (parcels.length > 100) throw new Error("В одном заказе можно отправить не более 100 посылок.");
    return { ...parcels[0].packing, parcels };
  }
  if (!items.length || items.some((i) => i.category_id !== plateCategoryId))
    return packingFor(items, rules);
  const parcels: NonNullable<PackingRule["parcels"]> = [];
  let current: DeliveryContext["items"] = [];
  let count = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1)
      throw new Error("Некорректное количество изделий.");
    let remaining = item.quantity;
    while (remaining) {
      const quantity = Math.min(2 - count, remaining);
      current.push({ ...item, quantity });
      count += quantity;
      remaining -= quantity;
      if (count === 2) {
        parcels.push({ items: current, packing: packingFor(current, rules) });
        current = [];
        count = 0;
      }
    }
  }
  if (current.length)
    parcels.push({ items: current, packing: packingFor(current, rules) });
  if (parcels.length > 100)
    throw new Error("В одном заказе можно отправить не более 100 посылок.");
  return { ...parcels[0].packing, parcels };
}

export function parcelContexts(context: DeliveryContext): DeliveryContext[] {
  return (
    context.packing.parcels?.map((parcel) => ({ ...context, ...parcel, cutoffAt: parcel.cutoff_at ?? context.cutoffAt })) ?? [
      context,
    ]
  );
}

export { shipmentDescription } from "./shipment-description";

export function moneyToKopecks(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value))
    throw new Error(
      "Не удалось получить стоимость доставки. Повторите расчёт.",
    );
  const [rubles, fraction = ""] = value.split(".");
  const result = Number(rubles) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result))
    throw new Error("Некорректная стоимость доставки.");
  return result;
}
export function cartSnapshot(items: DeliveryContext["items"]) {
  return items
    .map((i) => ({
      product_id: i.product_id,
      category_id: i.category_id,
      quantity: i.quantity,
      price: i.price,
      purchase_mode: i.purchase_mode,
      ...(i.configuration ? { configuration: { size: i.configuration.size, stems: i.configuration.stems, flowers: i.configuration.flowers, leaves: i.configuration.leaves }, line_id: i.line_id } : {}),
    }))
    .sort((a, b) => a.product_id.localeCompare(b.product_id) || (a.line_id ?? "").localeCompare(b.line_id ?? ""));
}

export function pointInCity(address: string, city: string) {
  const normalize = (s: string) =>
    s
      .trim()
      .toLocaleLowerCase("ru")
      .replace(/ё/g, "е")
      .replace(
        /^(?:г(?:ород)?|пгт|пос(?:елок)?|с(?:ело)?|д(?:еревня)?)\.?\s+/,
        "",
      )
      .replace(/\s+/g, " ");
  const requested = normalize(city);
  return (
    !!requested &&
    address.split(",").some((part) => normalize(part) === requested)
  );
}
