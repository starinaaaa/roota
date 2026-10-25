import { z } from "zod";

export const gardenParts = [
  {
    key: "stems",
    label: "Стебли-кубики",
    price: 350,
    hint: "Основа для башенок",
  },
  {
    key: "flowers",
    label: "Цветочки",
    price: 350,
    hint: "Завершают ваши растения",
  },
  {
    key: "leaves",
    label: "Листочки",
    price: 250,
    hint: "Плоские детали для игры с балансом",
  },
] as const;
export type GardenPart = (typeof gardenParts)[number]["key"];
export type GardenConfiguration = {
  size: 0 | 6 | 8 | 12 | 16 | 24;
  stems: number;
  flowers: number;
  leaves: number;
};
export const gardenSizes = [
  {
    size: 8,
    name: "Комнатный садик",
    caption: "Построить и любоваться",
    discount: 0,
    stems: 4,
    flowers: 2,
    leaves: 2,
  },
  {
    size: 12,
    name: "Палисадник",
    caption: "Больше места для фантазии",
    discount: 0,
    stems: 6,
    flowers: 3,
    leaves: 3,
  },
  {
    size: 16,
    name: "Садовый дворик",
    caption: "Для игры с друзьями",
    discount: 5,
    stems: 8,
    flowers: 4,
    leaves: 4,
  },
  {
    size: 24,
    name: "Оранжерея",
    caption: "Для большой компании",
    discount: 10,
    stems: 12,
    flowers: 6,
    leaves: 6,
  },
] as const;
export const gardenConfigurationSchema = z
  .strictObject({
    size: z.union([
      z.literal(0),
      z.literal(6),
      z.literal(8),
      z.literal(12),
      z.literal(16),
      z.literal(24),
    ]),
    stems: z.number().int().min(0).max(100),
    flowers: z.number().int().min(0).max(100),
    leaves: z.number().int().min(0).max(100),
  })
  .refine((c) => {
    const total = gardenCount(c);
    return total >= 1 && total <= 100;
  }, "Выберите от 1 до 100 деталей");

export function gardenCount(c: GardenConfiguration) {
  return c.stems + c.flowers + c.leaves;
}
export function gardenKey(c: GardenConfiguration) {
  return [c.size, c.stems, c.flowers, c.leaves].join(":");
}
export function defaultGarden(
  size: GardenConfiguration["size"] = 12,
): GardenConfiguration {
  // Keep existing six-piece carts readable; new presets start at eight.
  if (size === 6) return { size: 6, stems: 3, flowers: 2, leaves: 1 };
  const preset = gardenSizes.find((s) => s.size === size);
  return preset
    ? {
        size: preset.size,
        stems: preset.stems,
        flowers: preset.flowers,
        leaves: preset.leaves,
      }
    : { size: 0, stems: 1, flowers: 0, leaves: 0 };
}
export function gardenTier(count: number): 8 | 12 | 16 | 24 {
  return count >= 24 ? 24 : count >= 16 ? 16 : count >= 12 ? 12 : 8;
}
export function normalizeGarden(c: GardenConfiguration): GardenConfiguration {
  return { ...c, size: c.size === 0 ? 0 : gardenTier(gardenCount(c)) };
}
export function changeGardenPart(c: GardenConfiguration, key: GardenPart, value: number): GardenConfiguration {
  if (!Number.isFinite(value)) return c;
  const maximum = 100 - gardenCount(c) + c[key];
  return normalizeGarden({ ...c, [key]: Math.max(0, Math.min(maximum, Math.trunc(value))) });
}
export function gardenName(c: GardenConfiguration) {
  return c.size === 0 ? "Детали поштучно" : gardenSizes.find((s) => s.size === gardenTier(gardenCount(c)))!.name;
}
export function gardenPrice(c: GardenConfiguration) {
  const subtotal = (c.stems + c.flowers) * 350 + c.leaves * 250;
  const count = gardenCount(c);
  const discount = c.size === 0 ? 0 : count >= 24 ? 10 : count >= 16 ? 5 : 0;
  const total = Math.round((subtotal * (100 - discount)) / 100);
  return { subtotal, discount, total, saving: subtotal - total };
}
function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10,
    h = n % 100;
  return d === 1 && h !== 11
    ? one
    : d >= 2 && d <= 4 && (h < 12 || h > 14)
      ? few
      : many;
}
export function gardenCountLabel(n: number) {
  return `${n} ${plural(n, "деталь", "детали", "деталей")}`;
}
export function gardenSummary(c: GardenConfiguration) {
  return [
    c.stems
      ? `${c.stems} ${plural(c.stems, "стебель", "стебля", "стеблей")}`
      : "",
    c.flowers
      ? `${c.flowers} ${plural(c.flowers, "цветочек", "цветочка", "цветочков")}`
      : "",
    c.leaves
      ? `${c.leaves} ${plural(c.leaves, "листочек", "листочка", "листочков")}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export const gardenDescription =
  "Керамический конструктор для постройки домашнего сада и тренировки баланса. Башенки из этих кубиков строить непросто, но и в жизни равновесия достичь нелегко.\n\nСад можно собрать из стеблей-кубиков, цветочков и плоских листочков. Для того, чтобы играть с друзьями, лучше взять набор не меньше 8 кубиков (а мы обычно строим из 12), но для того, чтоб построить самому и любоваться, хватит и 6.\n\nНабор я собираю на свой вкус: вы выбираете количество деталей каждого вида, а я подбираю формы и цвета. Если хотите выбрать их вместе — напишите мне в Telegram или оставьте заявку, и я пришлю варианты.";
export const gardenCare =
  "При падении башенки на твёрдую поверхность возможны небольшие сколы. Лучше строить на коврике!";
