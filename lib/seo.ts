import { createServerClient } from "./db";
import "server-only";
export function siteUrl(path = "/") {
  return new URL(
    path,
    process.env.NEXT_PUBLIC_SITE_URL || "https://roota.moscow",
  ).toString();
}
export async function getProductRedirect(slug: string) {
  const db = createServerClient();
  const { data } = await db
    .from("product_redirects")
    .select("products(slug)")
    .eq("old_slug", slug)
    .maybeSingle();
  const product = data?.products as unknown as { slug: string } | null;
  return product?.slug ?? null;
}
