import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getProductBySlug, getRelatedProducts } from '@/lib/products'
import { getCart } from '@/lib/actions/cart'
import ProductImages from '@/components/product/ProductImages'
import ProductClientWrapper from '@/components/product/ProductClientWrapper'
import RelatedProducts from '@/components/product/RelatedProducts'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) return {}
  return {
    title: product.name,
    description: product.description ?? undefined,
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params

  // Run product fetch, related products and cart in parallel
  const [product, related, { items: cartItems }] = await Promise.all([
    getProductBySlug(slug),
    // related needs product.category_id — resolved after product fetch
    Promise.resolve(null as Awaited<ReturnType<typeof getRelatedProducts>> | null),
    getCart(),
  ])

  if (!product) notFound()

  // Fetch related now that we have the product (needs category_id + slug)
  const relatedProducts = await getRelatedProducts(product.category_id, slug)

  const inCart = cartItems.some(i => i.product_id === product.id)

  return (
    <div className="pt-16 md:pt-20">

      {/* Хлебные крошки */}
      <nav className="px-6 md:px-12 lg:px-16 py-5 border-b border-stone-200">
        <div className="max-w-[1440px] mx-auto flex items-center gap-3 font-body text-[10px] tracking-[0.18em] uppercase text-stone-400">
          <Link href="/catalog" className="hover:text-stone-700 transition-colors duration-200">
            Каталог
          </Link>
          {product.category && (
            <>
              <span>/</span>
              <Link
                href={`/catalog?category=${product.category.slug}`}
                className="hover:text-stone-700 transition-colors duration-200"
              >
                {product.category.name}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="text-stone-600">{product.name}</span>
        </div>
      </nav>

      {/* Основной блок товара */}
      <section className="px-6 md:px-12 lg:px-16 py-12 md:py-20">
        <div className="max-w-[1440px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20">
            <ProductImages images={product.images} name={product.name} />
            <ProductClientWrapper product={product} inCart={inCart} />
          </div>
        </div>
      </section>

      {/* Похожие работы */}
      <RelatedProducts products={relatedProducts} />

    </div>
  )
}
