type Category = { slug?: string; name?: string };
const singular: Record<string, string> = {
  plates: "Тарелка",
  glasses: "Стакан",
  cups: "Чашка",
  mugs: "Кружка",
  vases: "Ваза",
  bowls: "Миска",
  decor: "Декор",
};
/** Keep existing descriptive names intact; add the category to named designs. */
export function productTitle(name: string, category?: Category | null): string {
  if (category?.slug === "objects") return name;
  const kind = singular[category?.slug ?? ""] ?? category?.name;
  if (
    !kind ||
    /^(тарелка|стакан|чашка|кружка|ваза|миска|декор)(?:\s|$)/i.test(name.trim())
  )
    return name;
  return `${kind} «${name.trim().replace(/^[«„“"']|[»“”"']$/g, "")}»`;
}
