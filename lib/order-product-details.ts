import "server-only";
import { createServerClient } from "@/lib/db";
import { relationList } from "@/lib/relation-list";
import { productTitle } from "@/lib/product-title";

type ProductDetails = { title: (name: string) => string; image?: string };
/** Order access is checked by the caller. Never depend on catalogue publication. */
export async function orderProductDetails(ids: (string | null)[]) {
  const result = new Map<string, ProductDetails>();
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return result;
  const { data, error } = await createServerClient()
    .from("products")
    .select("id,categories(slug,name),product_images(id,public_url,is_primary,sort_order)")
    .in("id", unique);
  if (error) throw new Error("Не удалось загрузить изделия заказа");
  for (const product of data ?? []) {
    const category = relationList(product.categories)[0];
    const image = [...relationList(product.product_images)].sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) ||
        a.sort_order - b.sort_order,
    )[0];
    result.set(product.id, {
      title: (name) => productTitle(name, category),
      image: image ? (/^\/images\/garden\/garden-[1-5]\.webp$/.test(image.public_url) ? image.public_url : `/media/${product.id}/${image.id}`) : undefined,
    });
  }
  return result;
}
