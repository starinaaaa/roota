"use client";

import { bindPrepositions } from "@/lib/typography";
import Link from "next/link";
import Image from "@/components/ui/StoreImage";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { imageVariantVersion } from "@/lib/image-sizes";

export default function Hero({
  title = "Каждое изделие —\nотдельная история",
  intro = "Ручная керамика для дома — спокойные формы, живые поверхности и вещи, которые хочется держать рядом каждый день.",
  image = "/images/hero-bg.jpg",
}: {
  title?: string;
  intro?: string;
  image?: string;
}) {
  const [recovery, setRecovery] = useState({ image: "", attempt: 0 });
  const attempt = recovery.image === image ? recovery.attempt : 0;
  const source =
    attempt === 1 ? `${image}?w=960&v=${imageVariantVersion}` : image;
  return (
    <section className="relative w-full min-h-svh overflow-hidden bg-stone-900">
      {/* Background image — bg-stone-900 above acts as dark fallback */}
      <div className="absolute inset-0">
        <Image
          src={source}
          unoptimized={attempt > 0}
          onError={() => {
            if (!image.startsWith("/site-media/") || attempt >= 2) return;
            setRecovery({ image, attempt: attempt + 1 });
          }}
          alt="Авторская керамика"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>

      {/* Subtle dark gradient so white text stays readable at any scroll depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-stone-900/65 via-stone-900/45 to-stone-900/35" />

      {/* Content */}
      <div className="relative z-10 flex min-h-svh items-center pt-24 md:pt-28 px-6 pb-16 md:px-12 md:pb-20 lg:px-[12.5%] lg:pb-24">
        <div className="mx-auto w-full max-w-[1440px]">
          <div className="max-w-[900px]">
            <p className="mb-6 md:mb-7 font-body text-caption uppercase tracking-[0.08em] text-white">
              Авторская керамика · Ручная работа
            </p>

            <h1 className="mb-6 md:mb-7 font-display font-normal text-page leading-[1.08] text-white whitespace-pre-line break-words">
              {bindPrepositions(title)}
            </h1>

            <p className="mb-8 md:mb-10 max-w-[800px] font-body text-copy leading-relaxed text-white">
              {bindPrepositions(intro)}
            </p>

            <div>
              <Link
                href="/catalog"
                className="hero-action-link group inline-flex items-center gap-3 border-b border-white/50 pb-1 font-body text-ui uppercase tracking-[0.08em] text-white hover:border-white transition-colors"
              >
                Смотреть коллекцию
                <ArrowRight
                  size={18}
                  strokeWidth={1.5}
                  className="motion-safe:transition-transform motion-safe:group-hover:translate-x-1 motion-safe:group-focus-visible:translate-x-1"
                />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
