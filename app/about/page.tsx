import { bindPrepositions } from "@/lib/typography";
import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site";
import Link from "next/link";
import AboutHero from "@/components/about/AboutHero";
import AboutGallery from "@/components/about/AboutGallery";
import { aboutGallery } from "@/lib/about-gallery";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: "О студии",
  description:
    "Roota ceramics — авторская керамика ручной работы из Москвы. О студии, философии и процессе создания.",
};

export default async function AboutPage() {
  const site = await getSiteContent();
  const sections = [
    { id: "studio", title: "Студия", text: site.studioIntro },
    { id: "author", title: "Обо мне", text: site.processText },
    { id: "materials", title: "Материалы", text: site.materialsText },
  ];

  return (
    <div className="pt-16 md:pt-20">
      <AboutHero title={site.studioTitle} />
      <div className="w-full px-6 pb-12 md:px-12 md:pb-16 lg:px-16">
        <div className="divide-y divide-stone-200">
          {sections.map(({ id, title, text }) => (
            <section
              key={id}
              aria-labelledby={`${id}-heading`}
              className="grid gap-3 py-7 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] md:gap-10 md:py-9"
            >
              <h2 id={`${id}-heading`} className="font-display text-price">
                {bindPrepositions(title)}
              </h2>
              <div className="min-w-0 max-w-2xl space-y-4 font-body text-copy text-stone-800">
                {text.split(/\n\s*\n/).map((paragraph, index) => (
                  <p key={`${id}-${index}`} className="break-words">
                    {bindPrepositions(paragraph)}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <AboutGallery photos={aboutGallery} />

        <div className="border-t border-stone-200 pt-7 md:pt-9">
          <Link
            href="/catalog"
            className="inline-flex min-h-12 items-center justify-center border border-stone-900 bg-stone-900 px-6 py-4 font-body text-ui text-stone-50 transition-colors hover:border-stone-700 hover:bg-stone-700"
          >
            Посмотреть коллекцию
          </Link>
        </div>
      </div>
    </div>
  );
}
