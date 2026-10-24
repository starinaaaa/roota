import { bindPrepositions } from "@/lib/typography";
import Image from "@/components/ui/StoreImage";

export default function AboutHero({ title }: { title: string }) {
  return (
    <header className="relative isolate flex min-h-[calc(100svh-4rem)] items-center overflow-hidden bg-stone-800 px-6 py-24 md:min-h-[calc(100svh-5rem)] md:px-12 lg:px-16">
      <div className="absolute inset-0 -z-20">
        <Image
          src="/images/about/hero-plates-2284.jpg"
          alt="Тарелки Roota с авторскими чёрно-белыми рисунками"
          fill
          preload
          sizes="100vw"
          className="object-cover object-[center_48%]"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-stone-950/55 via-stone-950/30 to-stone-950/10" />
      <div className="w-full">
        <p className="mb-8 font-body text-caption uppercase tracking-[0.08em] text-white">
          О студии
        </p>
        <h1 className="max-w-[900px] whitespace-pre-line break-words font-display text-page leading-[1.08] text-white">
          {bindPrepositions(title)}
        </h1>
      </div>
    </header>
  );
}
