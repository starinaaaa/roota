import type { Metadata } from 'next'
import Hero from '@/components/home/Hero'
import BrandStatement from '@/components/home/BrandStatement'
import FeaturedProducts from '@/components/home/FeaturedProducts'

export const metadata: Metadata = {
  title: 'Студия авторской керамики — Glina',
  description:
    'Авторская керамика ручной работы. Тарелки, стаканы, вазы и декор — каждое изделие создано с заботой о деталях.',
}

export default async function HomePage() {
  // TODO: заменить на реальные данные из Supabase
  // const products = await getFeaturedProducts()

  return (
    <>
      <Hero />
      <BrandStatement />
      <FeaturedProducts />
    </>
  )
}
