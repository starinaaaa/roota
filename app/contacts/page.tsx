import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Контакты',
  description:
    'Контакты студии Roota ceramics — email, Telegram, Instagram. Индивидуальные заказы и сотрудничество.',
}

const CONTACTS = [
  {
    label: 'Email',
    value: 'hello@roota.moscow',
    href: 'mailto:hello@roota.moscow',
    external: false,
  },
  {
    label: 'Telegram',
    value: '@rootaceramics',
    href: 'https://t.me/rootaceramics',
    external: true,
  },
  {
    label: 'Instagram',
    value: '@roota.ceramics',
    href: 'https://instagram.com/roota.ceramics',
    external: true,
  },
]

export default function ContactsPage() {
  return (
    <div className="pt-16 md:pt-20">

      {/* ── Заголовок ── */}
      <section className="py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto">
          <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase mb-8">
            Контакты
          </p>
          <h1 className="font-display text-[clamp(3rem,7vw,6.5rem)] leading-[1.05] text-stone-900 max-w-xl">
            Напишите нам
          </h1>
        </div>
      </section>

      {/* ── Контакты ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase">
              Связь
            </p>
          </div>
          <div className="md:col-span-8 lg:col-span-9">
            <div className="divide-y divide-stone-200">
              {CONTACTS.map(({ label, value, href, external }) => (
                <div
                  key={label}
                  className="py-8 first:pt-0 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-8 items-center"
                >
                  <p className="font-body text-xs text-stone-400 tracking-[0.15em] uppercase">
                    {label}
                  </p>
                  <a
                    href={href}
                    target={external ? '_blank' : undefined}
                    rel={external ? 'noopener noreferrer' : undefined}
                    className="sm:col-span-2 font-body text-sm text-stone-900 hover:text-stone-500 transition-colors duration-200"
                  >
                    {value}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Студия ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16 bg-stone-100">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase">
              Студия
            </p>
          </div>
          <div className="md:col-span-8 lg:col-span-9 max-w-xl">
            <p className="font-body text-sm text-stone-900 mb-3">Москва</p>
            <p className="font-body text-sm text-stone-500 leading-loose">
              Мы работаем по предварительной записи. Посещение мастерской
              возможно — напишите нам, чтобы договориться о времени.
            </p>
          </div>
        </div>
      </section>

      {/* ── Индивидуальные заказы ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase">
              Сотрудничество
            </p>
          </div>
          <div className="md:col-span-8 lg:col-span-9 max-w-xl space-y-8">
            <p className="font-body text-sm text-stone-500 leading-loose">
              Мы открыты для индивидуальных заказов и коллабораций.
              Сервиз для ресторана, подарочный набор, корпоративный
              заказ — расскажите о своей идее, и мы обсудим детали.
            </p>
            <a
              href="mailto:hello@roota.moscow"
              className="inline-block font-body text-xs tracking-[0.2em] uppercase bg-stone-900 text-stone-50 px-8 py-4 hover:bg-stone-700 transition-colors duration-300"
            >
              Написать письмо
            </a>
          </div>
        </div>
      </section>

    </div>
  )
}
