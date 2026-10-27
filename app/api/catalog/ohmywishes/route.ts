import { getProducts } from "@/lib/products";
import { siteUrl } from "@/lib/seo";
export async function GET() {
  const products = await getProducts();
  return Response.json(
    {
      version: 1,
      currency: "RUB",
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        url: siteUrl(`/product/${p.slug}`),
        image: p.primary_image_url ? siteUrl(p.primary_image_url) : null,
        availability:
          p.stock_qty > 0
            ? "in_stock"
            : p.preorder_enabled
              ? "preorder"
              : "out_of_stock",
        configurator: p.configurator,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
