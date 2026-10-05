import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { defaultSite, siteSchema, type SiteContent } from "./site-schema";
import { requireAdmin } from "./auth";
import { createServerClient } from "./supabase/server";
import { getProducts } from "./products";
export const getSiteContent = cache(async (): Promise<SiteContent> => {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data } = await db
    .from("site_pages")
    .select("payload")
    .eq("id", 1)
    .maybeSingle();
  const parsed = siteSchema.safeParse(data?.payload);
  return parsed.success ? parsed.data : defaultSite;
});
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
