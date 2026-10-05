import type { Metadata } from "next";
import Hero from "@/components/home/Hero";
import BrandStatement from "@/components/home/BrandStatement";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import { getProducts } from "@/lib/products";
import { getSiteContent } from "@/lib/site";
import { siteUrl } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteContent();
  return {
    alternates: { canonical: "/" },
    title: "Студия авторской керамики — Roota ceramics",
    description: site.heroIntro,
    openGraph: {
      title: site.heroTitle,
      description: site.heroIntro,
      url: siteUrl("/"),
      images: [siteUrl(site.heroImage)],
    },
  };
}

export default async function HomePage() {
  const products = await getProducts();
  const site = await getSiteContent();
  const featured = products
    .filter((p) => p.featured)
    .sort((a, b) => (a.featured_order ?? 0) - (b.featured_order ?? 0));

  return (
    <>
      <Hero
        title={site.heroTitle}
        intro={site.heroIntro}
        image={site.heroImage}
      />
      <BrandStatement
        statement={site.studioStatement}
        summary={site.studioSummary}
      />
      <FeaturedProducts products={featured} />
    </>
  );
}
