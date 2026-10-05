import { getSiteDraft, getHeroPreview } from "@/lib/site";
import { getProductsByIds } from "@/lib/products";
import Hero from "@/components/home/Hero";
import BrandStatement from "@/components/home/BrandStatement";
import FeaturedProducts from "@/components/home/FeaturedProducts";
export default async function SitePreview() {
  const site = await getSiteDraft(),
    products = await getProductsByIds(site.featuredIds);
  return (
    <div>
      <p className="admin-card mb-6">
        Предпросмотр сохранённого черновика. Посетители его не видят.
      </p>
      <Hero
        title={site.heroTitle}
        intro={site.heroIntro}
        image={await getHeroPreview(site.heroImage)}
      />
      <BrandStatement
        statement={site.studioStatement}
        summary={site.studioSummary}
      />
      <FeaturedProducts
        products={site.featuredIds.flatMap((id) =>
          products.filter((p) => p.id === id),
        )}
      />
      <div className="admin-card space-y-8">
        <h2 className="text-xl">{site.studioTitle}</h2>
        {[
          site.studioIntro,
          site.processText,
          site.materialsText,
          site.studioQuote,
        ].map((text, n) => (
          <p className="whitespace-pre-wrap break-words" key={n}>
            {text}
          </p>
        ))}
        <h2 className="text-xl">Контакты</h2>
        <p>{site.email}</p>
        <p>{site.telegram}</p>
        <p>{site.instagram}</p>
        <h2 className="text-xl">Доставка и оплата</h2>
        {[...site.delivery, ...site.payment].map((item, n) => (
          <div key={n}>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
