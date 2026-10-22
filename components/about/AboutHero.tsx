import { bindPrepositions } from "@/lib/typography";
import Image from "@/components/ui/StoreImage";

export default function AboutHero({ title }: { title: string }) {
  return (
    <header>
      <h1 className="font-display text-page text-stone-900">О студии</h1>
      <p className="mt-5 max-w-2xl font-body text-copy text-stone-600">
        {bindPrepositions(title)}
      </p>
      <div className="relative mt-7 aspect-[4/3] overflow-hidden bg-stone-100 sm:aspect-[16/7] md:mt-9">
        <Image
          src="/images/about/hero-plates.jpg"
          alt="Тарелки Roota с авторскими рисунками в тёплом солнечном свете"
          fill
          preload
          sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1023px) calc(100vw - 96px), (max-width: 1207px) calc(100vw - 128px), 1080px"
          className="object-cover object-[center_48%]"
        />
      </div>
    </header>
  );
}
