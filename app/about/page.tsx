import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site";
import Link from "next/link";
import Image from "next/image";
import AboutHero from "@/components/about/AboutHero";
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
      <AboutHero
        title={site.studioTitle}
        photos={
          aboutGallery.length
            ? aboutGallery
            : [{ src: site.heroImage, alt: "Авторская керамика Roota" }]
        }
      />

      {/* ── Вступление ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase">
              Студия
            </p>
          </div>
          <div className="md:col-span-8 lg:col-span-9 space-y-6 max-w-2xl">
            <p className="font-body text-copy text-stone-800 leading-loose whitespace-pre-wrap break-words">
              {site.studioIntro}
            </p>
          </div>
        </div>
      </section>

      {/* ── Обо мне ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase mb-6">
              Обо мне
            </p>
            <h2 className="font-display text-section leading-tight text-stone-900">
              От рук
              <br />
              до стола
            </h2>
          </div>
          <div className="md:col-span-8 lg:col-span-9 space-y-6 max-w-2xl md:pt-14">
            <p className="font-body text-copy text-stone-800 leading-loose whitespace-pre-wrap break-words">
              {site.processText}
            </p>
          </div>
        </div>
      </section>

      {/* ── Материалы ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16 bg-stone-100">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase mb-6">
              Материалы
            </p>
            <h2 className="font-display text-section leading-tight text-stone-900">
              Глина
              <br />и глазурь
            </h2>
          </div>
          <div className="md:col-span-8 lg:col-span-9 space-y-6 max-w-2xl md:pt-14">
            <p className="font-body text-copy text-stone-800 leading-loose whitespace-pre-wrap break-words">
              {site.materialsText}
            </p>
          </div>
        </div>
      </section>

      {/* ── Иллюстрация ── */}
      <section className="border-t border-stone-200 bg-white px-6 py-16 md:px-12 md:py-20 lg:px-16">
        <div className="mx-auto max-w-[1440px]">
          <Image
            src="/images/about/illustration.png"
            alt="Нарисованный персонаж с лейкой"
            width={1076}
            height={1012}
            sizes="(max-width: 768px) 85vw, 520px"
            className="mx-auto h-auto w-full max-w-[520px]"
          />
        </div>
      </section>

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
            В каталог
          </Link>
        </div>
      </section>
    </div>
  );
}
