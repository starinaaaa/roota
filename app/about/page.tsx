import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'О студии',
  description:
    'Roota ceramics — авторская керамика ручной работы из Москвы. О студии, философии и процессе создания.',
}

export default function AboutPage() {
  return (
    <div className="pt-16 md:pt-20">

      {/* ── Заголовок ── */}
      <section className="py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto">
          <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase mb-8">
            О студии
          </p>
          <h1 className="font-display text-[clamp(3rem,7vw,6.5rem)] leading-[1.05] text-stone-900 max-w-3xl">
            Керамика, которая<br />живёт рядом с вами
          </h1>
        </div>
      </section>

      {/* ── Вступление ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase">
              Студия
            </p>
          </div>
          <div className="md:col-span-8 lg:col-span-9 space-y-6 max-w-2xl">
            <p className="font-body text-sm text-stone-500 leading-loose">
              Roota ceramics — мастерская авторской керамики в Москве.
              Мы не производим серии. Каждое изделие создаётся вручную:
              от первого касания глины до финальной обжиговой печи.
            </p>
            <p className="font-body text-sm text-stone-500 leading-loose">
              За студией стоит небольшая команда — люди, для которых
              керамика это не просто ремесло, а способ замедлиться
              и сделать что-то настоящее.
            </p>
          </div>
        </div>
      </section>

      {/* ── Процесс ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase mb-6">
              Процесс
            </p>
            <h2 className="font-display text-[clamp(1.8rem,3vw,3rem)] leading-tight text-stone-900">
              От рук<br />до стола
            </h2>
          </div>
          <div className="md:col-span-8 lg:col-span-9 space-y-6 max-w-2xl md:pt-14">
            <p className="font-body text-sm text-stone-500 leading-loose">
              Мы работаем на гончарном круге и вручную. Никаких пресс-форм,
              никакой автоматизации. Каждое изделие проходит этапы
              формовки, сушки, первого обжига, глазурования и финального
              обжига — всё в нашей мастерской.
            </p>
            <p className="font-body text-sm text-stone-500 leading-loose">
              Именно поэтому две тарелки из одной коллекции никогда не
              будут идентичными. Небольшие различия в форме и цвете —
              это не погрешность, а подпись мастера.
            </p>
          </div>
        </div>
      </section>

      {/* ── Материалы ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16 bg-stone-100">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase mb-6">
              Материалы
            </p>
            <h2 className="font-display text-[clamp(1.8rem,3vw,3rem)] leading-tight text-stone-900">
              Глина<br />и глазурь
            </h2>
          </div>
          <div className="md:col-span-8 lg:col-span-9 space-y-6 max-w-2xl md:pt-14">
            <p className="font-body text-sm text-stone-500 leading-loose">
              Мы используем каменную массу высокотемпературного обжига —
              плотную, долговечную, хорошо держащую форму. Глазури
              готовим сами: от матовых кремовых до глубоких пепельных тонов.
            </p>
            <p className="font-body text-sm text-stone-500 leading-loose">
              Все изделия безопасны для пищевого использования,
              подходят для посудомоечной машины и микроволновой печи.
            </p>
          </div>
        </div>
      </section>

      {/* ── Цитата ── */}
      <section className="border-t border-stone-200 py-28 md:py-36 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto">
          <p className="font-display text-[clamp(1.6rem,3.5vw,3rem)] leading-snug text-stone-800 max-w-3xl mx-auto text-center">
            «Нам важно, чтобы каждый предмет нёс в себе что-то тихое —
            ощущение, что он был сделан с намерением.»
          </p>
          <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase text-center mt-8">
            Roota ceramics · Москва
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-stone-200 py-20 md:py-24 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
          <h2 className="font-display text-[clamp(1.5rem,2.5vw,2.5rem)] text-stone-900">
            Посмотреть коллекцию
          </h2>
          <Link
            href="/catalog"
            className="font-body text-xs tracking-[0.2em] uppercase bg-stone-900 text-stone-50 px-8 py-4 hover:bg-stone-700 transition-colors duration-300 whitespace-nowrap"
          >
            В каталог
          </Link>
        </div>
      </section>

    </div>
  )
}
