import type { Product } from "@/types";
export type CatalogParams = {
  category?: string;
  stock?: string;
  q?: string;
  sort?: string;
  min?: string;
  max?: string;
};
export function filterCatalog(products: Product[], params: CatalogParams) {
  const q = (params.q ?? "").trim().slice(0, 150).toLocaleLowerCase("ru");
  const budget = (value?: string) =>
    value?.trim() && Number.isFinite(Number(value)) && Number(value) >= 0
      ? Number(value)
      : undefined;
  const min = budget(params.min),
    max = budget(params.max);
  return products
    .filter(
      (p) =>
        (!params.category ||
          params.category === "all" ||
          p.category?.slug === params.category) &&
        (params.stock !== "1" || (p.in_stock && p.stock_qty > 0)) &&
        (!q ||
          `${p.name} ${p.description} ${p.category?.name ?? ""}`
            .toLocaleLowerCase("ru")
            .includes(q)) &&
        (min === undefined || p.price >= min) &&
        (max === undefined || p.price <= max),
    )
    .sort((a, b) =>
      params.sort === "price_asc"
        ? a.price - b.price
        : params.sort === "price_desc"
          ? b.price - a.price
          : Date.parse(b.created_at) - Date.parse(a.created_at),
    );
}
