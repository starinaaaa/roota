import type { GardenConfiguration } from "./garden";
import { plateReceiptName } from "./payments/receipt-names";

type Parts = Pick<GardenConfiguration, "stems" | "flowers" | "leaves">;
function plural(n: number, forms: [string, string, string]) {
  const last = n % 10,
    hundred = n % 100;
  return forms[
    hundred >= 11 && hundred <= 14
      ? 2
      : last === 1
        ? 0
        : last >= 2 && last <= 4
          ? 1
          : 2
  ];
}
/** Use actual composition, never the mutable marketing name or the saved size label. */
export function gardenDocumentName(
  name: string,
  configuration?: Parts | null,
): string | null {
  let parts = configuration;
  if (!parts) {
    if (
      !/^(?:Керамический конструктор\s+«Сад»|Сад(?:\s|[—–:-]|$))/iu.test(
        name.trim(),
      )
    )
      return null;
    const stems = name.match(/стебли(?:-кубики)?\s*[:×]\s*(\d+)/iu)?.[1];
    const flowers = name.match(/цветочки\s*[:×]\s*(\d+)/iu)?.[1];
    const leaves = name.match(/листочки\s*[:×]\s*(\d+)/iu)?.[1];
    // A canonical title is already complete and can pass through unchanged.
    if (stems === undefined && flowers === undefined && leaves === undefined)
      return name
        .trim()
        .replace(/^Сад(?=$|\s|[—–:-])/iu, "Керамический конструктор «Сад»");
    parts = {
      stems: Number(stems ?? 0),
      flowers: Number(flowers ?? 0),
      leaves: Number(leaves ?? 0),
    };
  }
  const { stems, flowers, leaves } = parts;
  const count = stems + flowers + leaves;
  if (
    ![stems, flowers, leaves].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    count < 1 ||
    count > 100
  )
    throw new Error("Некорректный состав Сада для документов");
  return `Керамический конструктор «Сад» — ${count} ${plural(count, ["деталь", "детали", "деталей"])} (${stems} ${plural(stems, ["стебель", "стебля", "стеблей"])}, ${flowers} ${plural(flowers, ["цветочек", "цветочка", "цветочков"])}, ${leaves} ${plural(leaves, ["листочек", "листочка", "листочков"])})`;
}
export function productDocumentName(
  name: string,
  configuration?: Parts | null,
): string {
  return (
    gardenDocumentName(name, configuration) ??
    (/^(?:керамическая\s+)?тарелка(?:\s|$)|^тарелка\s+керамическая(?:\s|$)/iu.test(
      name.trim(),
    )
      ? plateReceiptName(name)
      : name.trim().replace(/\s+/g, " "))
  );
}
