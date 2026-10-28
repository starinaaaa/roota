import type { Product } from "@/types";
export function productBadge(
  product: Pick<Product, "in_stock" | "stock_qty" | "product_kind" | "configurator">,
): string | null {
  if (product.configurator === "garden") return "Предзаказ · примерно 3 недели";
  if (product.product_kind === "unique")
    return product.in_stock && product.stock_qty > 0
      ? "Единственный экземпляр"
      : "Нет в наличии";
  if (!product.in_stock) return "Скоро в наличии";
  if (product.stock_qty > 0 && product.stock_qty <= 3)
    return product.stock_qty === 1
      ? "Осталась 1 шт."
      : `Осталось ${product.stock_qty} шт.`;
  return null;
}
