import { gardenProductTitle } from "@/lib/garden-title";
import type { GardenConfiguration } from "@/lib/garden";
export type ShipmentCategory = { name?: string | null; slug?: string | null };

// Explicit singular forms keep the noun and adjective in the correct grammatical gender.
const ceramicNames: Record<string, string> = {
  plates: "Тарелка керамическая",
  тарелки: "Тарелка керамическая",
  тарелка: "Тарелка керамическая",
  glasses: "Стакан керамический",
  stakany: "Стакан керамический",
  стаканы: "Стакан керамический",
  стакан: "Стакан керамический",
  vases: "Ваза керамическая",
  vazy: "Ваза керамическая",
  вазы: "Ваза керамическая",
  ваза: "Ваза керамическая",
  mugs: "Кружка керамическая",
  kruzhki: "Кружка керамическая",
  кружки: "Кружка керамическая",
  кружка: "Кружка керамическая",
  cups: "Чашка керамическая",
  чашки: "Чашка керамическая",
  чашка: "Чашка керамическая",
  bowls: "Миска керамическая",
  миски: "Миска керамическая",
  миска: "Миска керамическая",
  dishes: "Блюдо керамическое",
  блюда: "Блюдо керамическое",
  блюдо: "Блюдо керамическое",
  decor: "Декор керамический",
  декор: "Декор керамический",
};
export function ceramicCategoryName(category?: ShipmentCategory | null) {
  const normalize = (s?: string | null) => s?.trim().toLocaleLowerCase("ru");
  return (
    ceramicNames[normalize(category?.slug) ?? ""] ??
    ceramicNames[normalize(category?.name) ?? ""] ??
    "Керамическое изделие"
  );
}
export function shipmentDescription(
  items: {
    product_name: string;
    quantity: number;
    category?: ShipmentCategory | null;
    configuration?: GardenConfiguration | null;
  }[],
) {
  const parts = items.map((item) => {
    if (item.configuration)
      return `${gardenProductTitle(item.product_name)} × ${item.quantity}`;
    const type = ceramicCategoryName(item.category);
    const noun = type.split(" ")[0];
    // Product titles sometimes already include their type; do not repeat it.
    const title = item.product_name
      .trim()
      .replace(
        new RegExp(`^${noun}(?:\\s+керамическ(?:ая|ий|ое))?(?:\\s+|$)`, "iu"),
        "",
      )
      .replace(/^[«"]|[»"]$/g, "")
      .trim();
    return `${type}${title ? ` «${title}»` : ""} × ${item.quantity}`;
  });
  const description = parts.join("; ");
  if (description.length > 500)
    throw new Error(
      "Описание посылки превышает 500 символов. Уменьшите количество изделий в посылке.",
    );
  return description;
}
