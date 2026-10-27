import { filterCatalog, type CatalogParams } from "@/lib/catalog-filter";
import { bindPrepositions } from "@/lib/typography";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getFilterCategories, getProductsByCategory } from "@/lib/products";
import ProductGrid from "@/components/product/ProductGrid";
import CategoryFilter from "@/components/catalog/CategoryFilter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/catalog" },
  title: "Каталог",
  description:
    "Авторская керамика ручной работы. Тарелки, стаканы, вазы и декор — каждое изделие создано в единственном экземпляре.",
};

type Props = {
  searchParams: Promise<CatalogParams>;
};

export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const activeSlug = params.category || "all";

  const [products, categories] = await Promise.all([
    getProductsByCategory(activeSlug),
    getFilterCategories(),
  ]);

  const filtered = filterCatalog(products, params);

  const countLabel = (() => {
    const n = filtered.length;
    if (n === 1) return "1 изделие";
    if (n >= 2 && n <= 4) return `${n} изделия`;
    return `${n} изделий`;
  })();

  return (
    <div className="pt-16 md:pt-20">
      {/* Заголовок страницы */}
      <section className="px-6 md:px-12 lg:px-16 py-8 md:py-14 border-b border-stone-200">
        <div className="max-w-[1440px] mx-auto">
          <p className="font-body text-caption tracking-[0.08em] uppercase text-stone-600 mb-3">
            Авторская керамика · Roota ceramics
          </p>
          <h1 className="font-display font-normal text-page leading-none text-stone-900">
            Каталог
          </h1>
        </div>
      </section>

      {/* Фильтр + счётчик */}
      <section className="px-6 md:px-12 lg:px-16 py-4 md:py-6 border-b border-stone-200">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <Suspense fallback={<div className="h-7" />}>
            <CategoryFilter activeSlug={activeSlug} categories={categories} />
          </Suspense>
          <p className="font-body text-caption tracking-[0.08em] uppercase text-stone-600 shrink-0">
            {bindPrepositions(countLabel)}
          </p>
        </div>
      </section>

      <form action="/catalog" className="mx-auto max-w-[1440px] px-6 md:px-12 py-6 flex flex-wrap items-end gap-4">
        <input type="hidden" name="category" value={activeSlug} />
        {params.stock === "1" && <input type="hidden" name="stock" value="1" />}
        <label className="space-y-2 text-ui">Поиск<input className="block border border-stone-300 p-3" name="q" type="search" maxLength={150} defaultValue={params.q} placeholder="Название изделия" /></label>
        <label className="space-y-2 text-ui">От, ₽<input className="block border border-stone-300 p-3 w-28" name="min" type="number" min="0" defaultValue={params.min} /></label>
        <label className="space-y-2 text-ui">До, ₽<input className="block border border-stone-300 p-3 w-28" name="max" type="number" min="0" defaultValue={params.max} /></label>
        <label className="space-y-2 text-ui">Сортировка<select name="sort" defaultValue={params.sort ?? "newest"} className="block border border-stone-300 p-3"><option value="newest">Сначала новые</option><option value="price_asc">Сначала дешевле</option><option value="price_desc">Сначала дороже</option></select></label>
        <button className="bg-stone-900 text-white px-6 py-3">Показать</button>
        <a href="/favorites" className="underline py-3">Избранное и подборки</a>
      </form>
      {filtered.length === 0 && <p className="px-6 py-8 text-ui">По этим условиям изделий нет. Попробуйте изменить поиск или бюджет.</p>}
      {/* Сетка товаров */}
      <section className="px-6 md:px-12 lg:px-16 pt-6 pb-12 md:py-12">
        <div className="max-w-[1440px] mx-auto">
          <ProductGrid products={filtered} />
        </div>
      </section>
    </div>
  );
}
