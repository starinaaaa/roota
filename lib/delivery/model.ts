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
  updated_at: string;
};
export type DeliveryPoint = {
  id: number;
  name: string;
  address: string;
  schedule?: string;
};
export type DeliveryQuote = {
  id: string;
  deliveryCost: number;
  insuranceCost: number;
  totalCost: number;
  estimatedDays: number | null;
  expiresAt: string;
  point: DeliveryPoint;
};
export type DeliveryContext = {
  phone: string;
  items: {
    product_id: string;
    category_id: string;
    quantity: number;
    price: number;
    purchase_mode: string;
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
      rule.composition.length === counts.size &&
      rule.composition.every((i) => counts.get(i.category_id) === i.quantity),
  );
  if (matches.length !== 1)
    throw new Error(
      "Для этого состава заказа упаковка ещё не настроена. Свяжитесь со студией.",
    );
  return matches[0];
}
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
    }))
    .sort((a, b) => a.product_id.localeCompare(b.product_id));
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
