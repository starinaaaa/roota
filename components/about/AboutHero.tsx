import { bindPrepositions } from "@/lib/typography";
import Image from "next/image";

export default function AboutHero({ title }: { title: string }) {
  return (
    <section className="relative isolate flex min-h-[520px] items-center overflow-hidden bg-stone-800 px-6 py-24 md:min-h-[640px] md:px-12 lg:px-16">
      <div className="absolute inset-0 -z-20">
        <Image
          src="/images/about/hero-plates.jpg"
          alt="Тарелки Roota с авторскими рисунками в тёплом солнечном свете"
          fill
          preload
          sizes="100vw"
          className="object-cover object-[center_48%]"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-stone-950/55 via-stone-950/30 to-stone-950/10" />
      <div className="mx-auto w-full max-w-[1440px]">
        <p className="mb-8 font-body text-caption uppercase tracking-[0.08em] text-white">
          О студии
        </p>
        <h1 className="max-w-[900px] font-display text-page leading-[1.08] text-white whitespace-pre-line break-words">
          {bindPrepositions(title)}
        </h1>
      </div>
    </section>
  );
}
