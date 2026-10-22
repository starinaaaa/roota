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
    <div className="px-6 pt-16 md:px-12 md:pt-20 lg:px-16">
      <div className="mx-auto max-w-[1080px] pb-12 pt-9 md:pb-16 md:pt-14">
        <AboutHero title={site.studioTitle} />

        <div className="mt-7 divide-y divide-stone-200 md:mt-9">
          {sections.map(({ id, title, text }) => (
            <section
              key={id}
              aria-labelledby={`${id}-heading`}
              className="grid gap-3 py-7 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-10 md:py-9"
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

        <div className="flex flex-col items-start gap-3 border-t border-stone-200 pt-7 md:flex-row md:items-center md:justify-between md:pt-9">
          <h2 className="font-display text-price">Посмотреть коллекцию</h2>
          <Link
            href="/catalog"
            className="inline-flex min-h-11 items-center gap-3 font-body text-ui underline underline-offset-4 transition-colors hover:text-stone-600"
          >
            В каталог <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
