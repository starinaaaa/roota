import { shopFeatures } from "@/lib/shop-features";
import { reviewQuery } from "@/lib/review-schema";
import { notFound } from "next/navigation";
import { getProducts } from "@/lib/products";
import { selectionSchema } from "@/lib/favorites";
import FavoritesList from "@/components/favorites/FavoritesList";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Подборка — Roota",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!shopFeatures.wishlist) notFound();
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  const { rows } = await reviewQuery(
    "saved_selections",
    "select items from public.saved_selections where token=$1 and expires_at>now()",
    [token],
  );
  const parsed = selectionSchema.safeParse(rows[0]?.items);
  if (!parsed.success) notFound();
  return (
    <main className="px-6 md:px-12 pt-28 pb-20 max-w-5xl mx-auto">
      <h1 className="font-display text-page mb-8">Выбранные изделия</h1>
      <FavoritesList products={await getProducts()} shared={parsed.data} />
    </main>
  );
}
