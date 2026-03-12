'use client'

import { useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  })

  // Параллакс-смещение для фото
  const imageY = useTransform(scrollYProgress, [0, 1], ['0%', '18%'])
  // Лёгкое затухание текста при скролле
  const textOpacity = useTransform(scrollYProgress, [0, 0.45], [1, 0])
  const textY = useTransform(scrollYProgress, [0, 0.45], ['0%', '-12%'])

  return (
    <section
      ref={containerRef}
      className="relative w-full h-screen min-h-[600px] max-h-[1000px] overflow-hidden bg-stone-900"
    >
      {/* Фоновое изображение с параллаксом */}
      <motion.div
        style={{ y: imageY }}
        className="absolute inset-0 will-change-transform"
      >
        <Image
          src="/images/hero-bg.jpg"
          alt="Авторская керамика"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-70"
          // Замените на реальное фото; пока используется placeholder
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
          }}
        />
        {/* Градиент поверх фото */}
        <div className="absolute inset-0 bg-gradient-to-b from-stone-900/30 via-transparent to-stone-900/60" />
      </motion.div>

      {/* Fallback-фон, если фото не загрузилось */}
      <div className="absolute inset-0 bg-stone-800" style={{ zIndex: -1 }} />

      {/* Текстовый блок */}
      <motion.div
        style={{ opacity: textOpacity, y: textY }}
        className="relative z-10 h-full flex flex-col justify-end pb-16 md:pb-20 lg:pb-24 px-6 md:px-12 lg:px-16"
      >
        <div className="max-w-[1440px] mx-auto w-full">
          <div className="max-w-2xl">

            {/* Надпись-лейбл */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}
              className="font-body text-xs text-stone-300 tracking-[0.25em] uppercase mb-6"
            >
              Авторская керамика · Ручная работа
            </motion.p>

            {/* Заголовок */}
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }}
              className="font-display text-[clamp(3rem,8vw,7rem)] leading-[0.95] text-stone-50 mb-8"
            >
              Каждое изделие —<br />
              <em className="not-italic text-stone-300">отдельная история</em>
            </motion.h1>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
            >
              <Link href="/catalog" className="inline-block group">
                <span className="
                  flex items-center gap-3
                  font-body text-sm tracking-[0.15em] uppercase
                  text-stone-50 border-b border-stone-50/40
                  pb-1 hover:border-stone-50/80
                  transition-colors duration-300
                ">
                  Смотреть коллекцию
                  <motion.span
                    whileHover={{ x: 4 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    <ArrowRight size={14} strokeWidth={1.5} />
                  </motion.span>
                </span>
              </Link>
            </motion.div>

          </div>
        </div>
      </motion.div>

      {/* Скролл-индикатор */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        style={{ opacity: textOpacity }}
        className="absolute bottom-8 right-8 md:right-14 z-10 hidden md:flex flex-col items-center gap-2"
      >
        <span className="font-body text-[10px] text-stone-400 tracking-[0.2em] uppercase [writing-mode:vertical-lr]">
          Scroll
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          className="w-px h-10 bg-stone-400/50"
        />
      </motion.div>

    </section>
  )
}
