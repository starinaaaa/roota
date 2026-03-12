'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { motion, useInView } from 'framer-motion'

export default function BrandStatement() {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section
      ref={ref}
      className="py-28 md:py-36 lg:py-44 px-6 md:px-12 lg:px-16"
    >
      <div className="max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-6 items-end">

          {/* Большой текст слева */}
          <div className="md:col-span-8 lg:col-span-7">

            {/* Маленький лейбл */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase mb-8"
            >
              О студии
            </motion.p>

            {/* Цитата */}
            <div className="overflow-hidden">
              {[
                'Мы делаем керамику,',
                'которую хочется',
                'трогать руками.',
              ].map((line, i) => (
                <div key={i} className="overflow-hidden">
                  <motion.p
                    initial={{ y: '100%' }}
                    animate={inView ? { y: 0 } : {}}
                    transition={{
                      duration: 0.75,
                      delay: 0.2 + i * 0.1,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="font-display text-[clamp(2.2rem,5vw,4.5rem)] leading-[1.1] text-stone-900"
                  >
                    {line}
                  </motion.p>
                </div>
              ))}
            </div>
          </div>

          {/* Текст + кнопка справа */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="md:col-span-4 lg:col-span-5 md:pb-2"
          >
            <p className="font-body text-sm text-stone-500 leading-loose mb-8 max-w-xs">
              Каждое изделие проходит через руки мастера от начала до конца.
              Никакого потока. Только внимание к форме, фактуре и смыслу.
            </p>

            <Link
              href="/about"
              className="group inline-flex items-center gap-2 font-body text-xs tracking-[0.18em] uppercase text-stone-900"
            >
              <span className="border-b border-stone-900/30 pb-0.5 group-hover:border-stone-900/80 transition-colors duration-300">
                Узнать больше
              </span>
            </Link>
          </motion.div>

        </div>

        {/* Горизонтальная линия */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: 1 } : {}}
          transition={{ duration: 1, delay: 0.6, ease: 'easeInOut' }}
          style={{ originX: 0 }}
          className="mt-16 md:mt-20 h-px bg-stone-200"
        />

      </div>
    </section>
  )
}
