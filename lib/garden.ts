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
  size: 0 | 6 | 8 | 12 | 24;
  stems: number;
  flowers: number;
  leaves: number;
};
export const gardenSizes = [
  {
    size: 6,
    name: "Комнатный садик",
    caption: "Построить и любоваться",
    discount: 0,
    stems: 3,
    flowers: 2,
    leaves: 1,
  },
  {
    size: 8,
    name: "Палисадник",
    caption: "Больше места для фантазии",
    discount: 5,
    stems: 4,
    flowers: 2,
    leaves: 2,
  },
  {
    size: 12,
    name: "Садовый дворик",
    caption: "Для игры с друзьями",
    discount: 10,
    stems: 6,
    flowers: 3,
    leaves: 3,
  },
  {
    size: 24,
    name: "Оранжерея",
    caption: "Для большой компании",
    discount: 15,
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
      z.literal(24),
    ]),
    stems: z.number().int().min(0).max(100),
    flowers: z.number().int().min(0).max(100),
    leaves: z.number().int().min(0).max(100),
  })
  .refine((c) => {
    const total = gardenCount(c);
    return c.size === 0 ? total >= 1 && total <= 100 : total === c.size;
  }, "Заполните выбранный размер сада");

export function gardenCount(c: GardenConfiguration) {
  return c.stems + c.flowers + c.leaves;
}
export function gardenKey(c: GardenConfiguration) {
  return [c.size, c.stems, c.flowers, c.leaves].join(":");
}
export function defaultGarden(
  size: GardenConfiguration["size"] = 12,
): GardenConfiguration {
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
export function gardenName(c: GardenConfiguration) {
  return gardenSizes.find((s) => s.size === c.size)?.name ?? "Детали поштучно";
}
export function gardenPrice(c: GardenConfiguration) {
  const subtotal = (c.stems + c.flowers) * 350 + c.leaves * 250;
  const discount = gardenSizes.find((s) => s.size === c.size)?.discount ?? 0;
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
  "Керамический конструктор для постройки домашнего сада и тренировки баланса. Башенки из этих кубиков строить непросто, но и в жизни равновесия достичь нелегко.\n\nСад можно собрать из стеблей-кубиков, цветочков и плоских листочков. Для небольшой композиции хватит 6 деталей. Для игры с друзьями лучше выбрать «Садовый дворик» из 12 деталей — мы обычно строим именно в таком масштабе.\n\nНабор я собираю на свой вкус: вы выбираете количество деталей каждого вида, а я подбираю формы и цвета. Если хотите выбрать их вместе — напишите мне в Telegram или оставьте заявку, и я пришлю варианты.";
export const gardenCare =
  "При падении башенки на твёрдую поверхность с большой высоты возможны небольшие сколы. Лучше строить на коврике!";
