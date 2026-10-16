import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { defaultSite, siteSchema, type SiteContent } from "./site-schema";
import { requireAdmin } from "./auth";
import { createServerClient } from "./db";
import { getProducts } from "./products";
export const getSiteContent = cache(
  unstable_cache(
    async (): Promise<SiteContent> => {
      const db = createServerClient();
      const { data, error } = await db
        .from("site_pages")
        .select("payload")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw new Error("SITE_CONTENT_UNAVAILABLE");
      const parsed = siteSchema.safeParse(data?.payload);
      return parsed.success ? parsed.data : defaultSite;
    },
    ["public-site-content"],
    { tags: ["site"], revalidate: 60 },
  ),
);
export async function getSiteDraft() {
  await requireAdmin();
  const db = createServerClient();
  const { data, error } = await db
    .from("site_drafts")
    .select("payload")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error("Не удалось загрузить черновик");
  const parsed = siteSchema.safeParse(data?.payload);
  if (parsed.success) return parsed.data;
  const products = await getProducts();
  return {
    ...(await getSiteContent()),
    featuredIds: products.slice(0, 4).map((p) => p.id),
  };
}
export async function getHeroPreview(url: string) {
  await requireAdmin();
  if (!url.startsWith("/site-media/")) return url;
  const { data } = await createServerClient()
    .storage.from("product-drafts")
    .createSignedUrl(`site/${url.split("/").pop()}.webp`, 3600);
  return data?.signedUrl ?? url;
}
