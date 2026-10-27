import { shopFeatures } from "@/lib/shop-features";
import { notFound } from "next/navigation";
import { getProducts } from "@/lib/products";
import { decodeSelection } from "@/lib/favorites";
import FavoritesList from "@/components/favorites/FavoritesList";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Подборка — Roota",
  robots: { index: false, follow: false },
};
export default async function SelectionPage({
  searchParams,
}: {
  searchParams: Promise<{ items?: string }>;
}) {
  if (!shopFeatures.wishlist) notFound();
  const items = decodeSelection((await searchParams).items);
  if (!items) notFound();
  return (
    <main className="px-6 md:px-12 pt-28 pb-20 max-w-5xl mx-auto">
      <h1 className="font-display text-page mb-8">Выбранные изделия</h1>
      <FavoritesList products={await getProducts()} shared={items} />
    </main>
  );
}
