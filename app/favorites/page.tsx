import { getProducts } from "@/lib/products";
import FavoritesList from "@/components/favorites/FavoritesList";
export const metadata = {
  title: "Избранное — Roota",
  robots: { index: false, follow: false },
};
export default async function Page() {
  return (
    <main className="px-6 md:px-12 pt-28 pb-20 max-w-5xl mx-auto">
      <h1 className="font-display text-page mb-8">Избранное и подборки</h1>
      <FavoritesList products={await getProducts()} />
    </main>
  );
}
