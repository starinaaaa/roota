import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/products";
import { siteUrl } from "@/lib/seo";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    ...["/", "/catalog", "/about", "/contacts", "/delivery"].map((path) => ({
      url: siteUrl(path),
    })),
    ...(await getProducts()).map((p) => ({
      url: siteUrl("/product/" + p.slug),
      lastModified: p.updated_at,
    })),
  ];
}
