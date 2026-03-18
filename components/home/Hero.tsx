'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

export default function Hero() {
  return (
    <section className="relative w-full min-h-svh overflow-hidden bg-stone-900">

      {/* Background image — bg-stone-900 above acts as dark fallback */}
      <div className="absolute inset-0">
        <Image
          src="/images/hero-bg.jpg"
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
      <div className="relative z-10 flex min-h-svh items-center pt-24 md:pt-28 px-6 pb-16 md:px-12 md:pb-20 lg:px-16 lg:pb-24">
        <div className="mx-auto w-full max-w-[1440px]">
          <div className="max-w-2xl">

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-6 font-body text-[11px] uppercase tracking-[0.25em] text-white"
            >
              Авторская керамика · Ручная работа
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="mb-6 font-display font-normal text-[clamp(1.8rem,3.6vw,3.15rem)] leading-[0.95] text-white"
            >
              Каждое изделие —
              <br />
              отдельная история
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mb-8 max-w-xl font-body text-sm leading-relaxed text-white/90 md:text-[15px]"
            >
              Ручная керамика для дома — спокойные формы, живые поверхности и вещи,
              которые хочется держать рядом каждый день.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
            >
              <Link
                href="/catalog"
                className="inline-flex items-center gap-3 border-b border-white/50 pb-1 font-body text-[17px] uppercase tracking-[0.15em] text-white hover:border-white transition-colors"
              >
                Смотреть коллекцию
                <ArrowRight size={14} strokeWidth={1.5} />
              </Link>
            </motion.div>

          </div>
        </div>
      </div>
    </section>
  )
}
