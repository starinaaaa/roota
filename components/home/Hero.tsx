"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export default function Hero({
  title = "Каждое изделие —\nотдельная история",
  intro = "Ручная керамика для дома — спокойные формы, живые поверхности и вещи, которые хочется держать рядом каждый день.",
  image = "/images/hero-bg.jpg",
}: {
  title?: string;
  intro?: string;
  image?: string;
}) {
  return (
    <section className="relative w-full min-h-svh overflow-hidden bg-stone-900">
      {/* Background image — bg-stone-900 above acts as dark fallback */}
      <div className="absolute inset-0">
        <Image
          src={image}
          alt="Авторская керамика"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>

      {/* Subtle dark gradient so white text stays readable at any scroll depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-stone-900/60 via-stone-900/10 to-transparent" />

      {/* Content */}
      <div className="relative z-10 flex min-h-svh items-center pt-24 md:pt-28 px-6 pb-16 md:px-12 md:pb-20 lg:px-[12.5%] lg:pb-24">
        <div className="mx-auto w-full max-w-[1440px]">
          <div className="max-w-[900px]">
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-6 md:mb-7 font-body text-xs md:text-sm uppercase tracking-[0.25em] text-white"
            >
              Авторская керамика · Ручная работа
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="mb-6 md:mb-7 font-display font-normal text-[clamp(2.2rem,4.5vw,4rem)] leading-[0.95] text-white whitespace-pre-line break-words"
            >
              {title}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mb-8 md:mb-10 max-w-[800px] font-body text-base leading-relaxed text-white/90 md:text-[19px]"
            >
              {intro}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
            >
              <Link
                href="/catalog"
                className="inline-flex items-center gap-3 border-b border-white/50 pb-1 font-body text-base md:text-[21px] uppercase tracking-[0.15em] text-white hover:border-white transition-colors"
              >
                Смотреть коллекцию
                <ArrowRight size={18} strokeWidth={1.5} />
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
