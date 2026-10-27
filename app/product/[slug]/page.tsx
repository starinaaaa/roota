import { gardenConfigurationSchema } from "@/lib/garden";
import { Suspense } from "react";
import { bindPrepositions } from "@/lib/typography";
import { notFound, permanentRedirect } from "next/navigation";
import { getProductRedirect, siteUrl } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { getProductBySlug, getRelatedProducts } from "@/lib/products";
import { getCart } from "@/lib/actions/cart";
import ProductImages from "@/components/product/ProductImages";
import ProductClientWrapper from "@/components/product/ProductClientWrapper";
import RelatedProducts from "@/components/product/RelatedProducts";
import GardenProduct from "@/components/garden/GardenProduct";
import { getSiteContent } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ garden?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  return {
    title: product.seo_title || product.name,
    description: product.seo_description || product.description || undefined,
    other: {
      "product:price.amount": String(product.price),
      "product:price.currency": "RUB",
    },
    alternates: { canonical: siteUrl("/product/" + product.slug) },
    openGraph: {
      title: product.seo_title || product.name,
      description: product.seo_description || product.description || undefined,
      url: siteUrl("/product/" + product.slug),
      images: product.images.slice(0, 1).map((url) => ({ url: siteUrl(url) })),
    },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;

  const query = await searchParams;
  let initialGarden;
  try {
    const parsed = gardenConfigurationSchema.safeParse(
      JSON.parse(query?.garden ?? "null"),
    );
    if (parsed.success) initialGarden = parsed.data;
  } catch {}
  const [product, { items: cartItems }] = await Promise.all([
    getProductBySlug(slug),
    getCart(),
  ]);

  if (!product) {
    const slugRedirect = await getProductRedirect(slug);
    if (slugRedirect) permanentRedirect("/product/" + slugRedirect);
    notFound();
  }

  const inCart = cartItems.some((i) => i.product_id === product.id);
  const site =
    product.configurator === "garden" ? await getSiteContent() : null;

  return (
    <div className="pt-16 md:pt-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.description,
            image: product.images.map((url) => siteUrl(url)),
            sku: product.sku || product.id,
            offers: {
              "@type": "Offer",
              url: siteUrl("/product/" + product.slug),
              priceCurrency: "RUB",
              price: product.configurator === "garden" ? 250 : product.price,
              availability:
                product.in_stock && product.stock_qty > 0
                  ? "https://schema.org/InStock"
                  : product.preorder_enabled
                    ? "https://schema.org/PreOrder"
                    : "https://schema.org/OutOfStock",
            },
          }).replace(/</g, "\u003c"),
        }}
      />

      {/* Хлебные крошки */}
      <nav className="px-6 md:px-12 lg:px-16 py-5 border-b border-stone-200">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 font-body text-caption tracking-[0.08em] uppercase text-stone-600 [overflow-wrap:anywhere]">
          <Link
            href="/catalog"
            className="hover:text-stone-700 transition-colors duration-200"
          >
            Каталог
          </Link>
          {product.category && (
            <>
              <span>/</span>
              <Link
                href={`/catalog?category=${product.category.slug}`}
                className="hover:text-stone-700 transition-colors duration-200"
              >
                {bindPrepositions(product.category.name)}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="text-stone-600">
            {bindPrepositions(product.name)}
          </span>
        </div>
      </nav>

      {/* Основной блок товара */}
      <section className="px-6 md:px-12 lg:px-16 py-12 md:py-20">
        <div className="max-w-[1440px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <ProductImages images={product.images} name={product.name} />
            </div>
            {product.configurator === "garden" ? (
              <GardenProduct
                key={JSON.stringify(initialGarden ?? null)}
                initial={initialGarden}
                product={product}
                telegram={site!.telegram}
              />
            ) : (
              <ProductClientWrapper product={product} inCart={inCart} />
            )}
          </div>
        </div>
      </section>

      {/* Похожие работы */}
      <Suspense fallback={null}>
        <ProductRecommendations categoryId={product.category_id} slug={slug} />
      </Suspense>
    </div>
  );
}

// Recommendations must not delay the main photograph and purchase controls.
async function ProductRecommendations({
  categoryId,
  slug,
}: {
  categoryId: string;
  slug: string;
}) {
  const products = await getRelatedProducts(categoryId, slug);
  return <RelatedProducts products={products} />;
}
