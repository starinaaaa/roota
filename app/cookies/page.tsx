import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Использование cookie',
  description:
    'Информация об использовании файлов cookie на сайте Roota ceramics.',
}

const SECTIONS = [
  {
    heading: '1. Что такое cookie',
    paragraphs: [
      'Cookie — это небольшие текстовые файлы, которые сайт сохраняет в браузере при посещении. Они не содержат персональных данных и не могут запускать программы на вашем устройстве.',
      'Cookie позволяют сайту «запомнить» действия пользователя между сессиями — например, содержимое корзины.',
    ],
  },
  {
    heading: '2. Какие cookie использует этот сайт',
    paragraphs: [
      'Технические (функциональные) cookie — необходимы для работы сайта. Без них корзина покупок не будет сохранять выбранные товары между страницами и сессиями.',
      'Уведомление о cookie — однократно сохраняет ваш выбор (принятие уведомления), чтобы баннер не появлялся при каждом визите.',
      'Мы не используем сторонние рекламные cookie, трекеры или пиксели социальных сетей.',
    ],
  },
  {
    heading: '3. Как отключить cookie',
    paragraphs: [
      'Вы можете отключить или ограничить cookie в настройках браузера. Инструкции зависят от браузера: в Chrome — «Настройки → Конфиденциальность и безопасность → Файлы cookie»; в Safari — «Настройки → Конфиденциальность»; в Firefox — «Настройки → Приватность и защита».',
      'Обратите внимание: отключение функциональных cookie приведёт к тому, что корзина покупок перестанет работать корректно.',
    ],
  },
  {
    heading: '4. Контакты',
    paragraphs: [
      'Если у вас есть вопросы об использовании cookie на нашем сайте, напишите нам: [Email].',
    ],
  },
]

export default function CookiesPage() {
  return (
    <div className="pt-16 md:pt-20">

      {/* ── Заголовок ── */}
      <section className="py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto">
          <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase mb-8">
            Документы
          </p>
          <h1 className="font-display text-[clamp(2.5rem,6vw,5.5rem)] leading-[1.05] text-stone-900 max-w-2xl">
            Файлы cookie
          </h1>
        </div>
      </section>

      {/* ── Содержание ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">

          {/* Левая колонка */}
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase sticky top-28">
              Cookie
            </p>
          </div>

          {/* Правая колонка */}
          <div className="md:col-span-8 lg:col-span-9 max-w-2xl">
            <div className="space-y-12">
              {SECTIONS.map((section) => (
                <div
                  key={section.heading}
                  className="border-t border-stone-100 pt-10 first:border-t-0 first:pt-0"
                >
                  <h2 className="font-body text-xs tracking-[0.15em] uppercase text-stone-500 mb-5">
                    {section.heading}
                  </h2>
                  <div className="space-y-4">
                    {section.paragraphs.map((p, i) => (
                      <p key={i} className="font-body text-sm text-stone-500 leading-loose">
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

    </div>
  )
}
