import type { Metadata } from 'next'
import Hero from '@/components/home/Hero'
import BrandStatement from '@/components/home/BrandStatement'
import FeaturedProducts from '@/components/home/FeaturedProducts'
import { getProducts } from '@/lib/products'

export const metadata: Metadata = {
  title: 'Студия авторской керамики — Roota ceramics',
  description:
    'Авторская керамика ручной работы. Тарелки, стаканы, вазы и декор — каждое изделие создано с заботой о деталях.',
}

export default async function HomePage() {
  const products = await getProducts()

  return (
    <>
      <Hero />
      <BrandStatement />
      <FeaturedProducts products={products.slice(0, 4)} />
    </>
  )
}
