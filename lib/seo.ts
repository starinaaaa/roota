import "server-only";
import { createClient } from "@supabase/supabase-js";
export function siteUrl(path = "/") {
  return new URL(
    path,
    process.env.NEXT_PUBLIC_SITE_URL || "https://roota-liart.vercel.app",
  ).toString();
}
export async function getProductRedirect(slug: string) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data } = await db
    .from("product_redirects")
    .select("products(slug)")
    .eq("old_slug", slug)
    .maybeSingle();
  const product = data?.products as unknown as { slug: string } | null;
  return product?.slug ?? null;
}
