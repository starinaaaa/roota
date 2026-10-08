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
  return (
    <div className="pt-16 md:pt-20">
      <AboutHero title={site.studioTitle} />

      {/* ── Вступление ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8 items-start">
          <div className="md:col-span-4">
            <h2 className="font-display text-section leading-tight text-stone-900">
              Студия
            </h2>
          </div>
          <div className="md:col-span-8 space-y-6 max-w-2xl">
            <p className="font-body text-copy text-stone-800 leading-loose whitespace-pre-wrap break-words">
              {bindPrepositions(site.studioIntro)}
            </p>
          </div>
        </div>
      </section>

      {/* ── Обо мне ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8 items-start">
          <div className="md:col-span-4">
            <h2 className="font-display text-section leading-tight text-stone-900">
              Обо мне
            </h2>
          </div>
          <div className="md:col-span-8 space-y-6 max-w-2xl">
            <p className="font-body text-copy text-stone-800 leading-loose whitespace-pre-wrap break-words">
              {bindPrepositions(site.processText)}
            </p>
          </div>
        </div>
      </section>

      {/* ── Материалы ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16 bg-stone-100">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8 items-start">
          <div className="md:col-span-4">
            <h2 className="font-display text-section leading-tight text-stone-900">
              Материалы
            </h2>
          </div>
          <div className="md:col-span-8 space-y-6 max-w-2xl">
            <p className="font-body text-copy text-stone-800 leading-loose whitespace-pre-wrap break-words">
              {bindPrepositions(site.materialsText)}
            </p>
          </div>
        </div>
      </section>

      <AboutGallery photos={aboutGallery} />

      {/* ── CTA ── */}
      <section className="border-t border-stone-200 py-20 md:py-24 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
          <h2 className="font-display text-section text-stone-900">
            Посмотреть коллекцию
          </h2>
          <Link
            href="/catalog"
            className="font-body text-ui tracking-[0.08em] uppercase bg-stone-900 text-stone-50 px-8 py-4 hover:bg-stone-700 transition-colors duration-300 whitespace-nowrap"
          >
            В каталог
          </Link>
        </div>
      </section>
    </div>
  );
}
