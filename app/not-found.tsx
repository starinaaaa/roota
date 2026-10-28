import type { Metadata } from "next";
import Link from "next/link";
import CharacterArt from "@/components/illustrations/CharacterArt";
import { bindPrepositions } from "@/lib/typography";

export const metadata: Metadata = {
  title: "Ой, похоже, вы заплутали · roota",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <section className="flex min-h-[85svh] items-center px-6 pb-16 pt-32 md:px-12 md:pt-40">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-8 md:grid-cols-[1fr_1.6fr] md:gap-16">
        <div className="relative mx-auto flex h-52 w-64 items-center justify-center md:h-80 md:w-full">
          <span
            aria-hidden="true"
            className="absolute font-display text-[100px] tracking-[0.08em] text-stone-200 md:text-[140px]"
          >
            404
          </span>
          <CharacterArt
            character="walker"
            loading="eager"
            className="relative ml-24 h-52 w-28 rotate-[-8deg] md:ml-32 md:h-72 md:w-40"
          />
        </div>
        <div>
          <p className="mb-4 font-body text-ui uppercase tracking-[0.12em] text-stone-600">
            Тропинка потерялась
          </p>
          <h1 className="font-display text-section leading-tight">
            {bindPrepositions("Ой, похоже, вы заплутали")}
          </h1>
          <p className="mt-5 max-w-lg text-copy leading-relaxed text-stone-700">
            {bindPrepositions(
              "Наш чудик тоже свернул не туда. Здесь пока ничего не выросло — пойдём туда, где есть керамика.",
            )}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/catalog"
              className="rounded-md bg-stone-900 px-6 py-4 text-center font-body text-ui uppercase tracking-[0.06em] text-stone-50 transition-colors hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-900"
            >
              В каталог
            </Link>
            <Link
              href="/"
              className="rounded-md border border-stone-400 px-6 py-4 text-center font-body text-ui uppercase tracking-[0.06em] transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-900"
            >
              На главную
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
