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
  searchParams: Promise<{ category?: string; stock?: string }>;
};

export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const activeSlug = params.category || "all";

  const [products, categories] = await Promise.all([
    getProductsByCategory(activeSlug),
    getFilterCategories(),
  ]);

  const filtered =
    params.stock === "1"
      ? products.filter((p) => p.in_stock && p.stock_qty > 0)
      : products;

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

      {/* Сетка товаров */}
      <section className="px-6 md:px-12 lg:px-16 pt-6 pb-12 md:py-12">
        <div className="max-w-[1440px] mx-auto">
          <ProductGrid products={filtered} />
        </div>
      </section>
    </div>
  );
}
