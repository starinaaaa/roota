import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getFilterCategories, getProductsByCategory } from '@/lib/products'
import ProductGrid from '@/components/product/ProductGrid'
import CategoryFilter from '@/components/catalog/CategoryFilter'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Каталог',
  description:
    'Авторская керамика ручной работы. Тарелки, стаканы, вазы и декор — каждое изделие создано в единственном экземпляре.',
}

type Props = {
  searchParams: Promise<{ category?: string }>
}

export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams
  const activeSlug = params.category || 'all'

  const [filtered, categories] = await Promise.all([
    getProductsByCategory(activeSlug),
    getFilterCategories(),
  ])

  const countLabel = (() => {
    const n = filtered.length
    if (n === 1) return '1 изделие'
    if (n >= 2 && n <= 4) return `${n} изделия`
    return `${n} изделий`
  })()

  return (
    <div className="pt-16 md:pt-20">

      {/* Заголовок страницы */}
      <section className="px-6 md:px-12 lg:px-16 py-16 md:py-24 border-b border-stone-200">
        <div className="max-w-[1440px] mx-auto">
          <p className="font-body text-[10px] tracking-[0.3em] uppercase text-stone-400 mb-6">
            Авторская керамика · Roota ceramics
          </p>
          <h1 className="font-display font-normal text-[clamp(3.15rem,7.2vw,6.3rem)] leading-none text-stone-900">
            Каталог
          </h1>
        </div>
      </section>

      {/* Фильтр + счётчик */}
      <section className="px-6 md:px-12 lg:px-16 py-7 border-b border-stone-200">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <Suspense fallback={<div className="h-7" />}>
            <CategoryFilter activeSlug={activeSlug} categories={categories} />
          </Suspense>
          <p className="font-body text-[10px] tracking-[0.18em] uppercase text-stone-400 shrink-0">
            {countLabel}
          </p>
        </div>
      </section>

      {/* Сетка товаров */}
      <section className="px-6 md:px-12 lg:px-16 py-16 md:py-20">
        <div className="max-w-[1440px] mx-auto">
          <ProductGrid products={filtered} />
        </div>
      </section>

    </div>
  )
}
