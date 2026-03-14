import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Доставка и оплата',
  description:
    'Условия доставки, оплаты, упаковки и ухода за керамикой Roota ceramics.',
}

const DELIVERY_ITEMS = [
  {
    title: 'Курьером по Москве',
    text: 'Доставка в течение 1–2 дней. Стоимость — от 400 ₽. Бесплатно при заказе от 5 000 ₽.',
  },
  {
    title: 'СДЭК / Почта России',
    text: 'Отправляем по всей России. Срок — 3–7 рабочих дней в зависимости от региона. Стоимость рассчитывается при оформлении заказа.',
  },
  {
    title: 'Самовывоз',
    text: 'Забрать заказ можно из нашей мастерской в Москве. Адрес и время — по договорённости после оформления.',
  },
]

const PAYMENT_ITEMS = [
  {
    title: 'Онлайн-оплата',
    text: 'Банковская карта через защищённую форму. Принимаем Visa, Mastercard, МИР.',
  },
  {
    title: 'Перевод на карту',
    text: 'После подтверждения заказа мы пришлём реквизиты для оплаты.',
  },
]

const CARE_ITEMS = [
  'Подходит для посудомоечной машины на щадящем режиме.',
  'Совместимо с микроволновой печью — без металлического декора.',
  'Не рекомендуется резкий перепад температур: не ставьте горячую посуду в холодную воду.',
  'Матовые глазури со временем приобретают патину — это нормально и красиво.',
]

export default function DeliveryPage() {
  return (
    <div className="pt-16 md:pt-20">

      {/* ── Заголовок ── */}
      <section className="py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto">
          <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase mb-8">
            Информация
          </p>
          <h1 className="font-display text-[clamp(3rem,7vw,6.5rem)] leading-[1.05] text-stone-900 max-w-2xl">
            Доставка<br />и оплата
          </h1>
        </div>
      </section>

      {/* ── Доставка ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase">
              Доставка
            </p>
          </div>
          <div className="md:col-span-8 lg:col-span-9">
            <div className="divide-y divide-stone-200">
              {DELIVERY_ITEMS.map((item) => (
                <div
                  key={item.title}
                  className="py-8 first:pt-0 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-8"
                >
                  <p className="font-body text-sm text-stone-900">{item.title}</p>
                  <p className="sm:col-span-2 font-body text-sm text-stone-500 leading-relaxed">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Оплата ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase">
              Оплата
            </p>
          </div>
          <div className="md:col-span-8 lg:col-span-9">
            <div className="divide-y divide-stone-200">
              {PAYMENT_ITEMS.map((item) => (
                <div
                  key={item.title}
                  className="py-8 first:pt-0 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-8"
                >
                  <p className="font-body text-sm text-stone-900">{item.title}</p>
                  <p className="sm:col-span-2 font-body text-sm text-stone-500 leading-relaxed">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Упаковка ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16 bg-stone-100">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase">
              Упаковка
            </p>
          </div>
          <div className="md:col-span-8 lg:col-span-9 max-w-xl">
            <p className="font-body text-sm text-stone-500 leading-loose">
              Каждое изделие упаковывается вручную: крафтовая бумага,
              наполнитель, фирменная коробка. Хрупкие предметы
              дополнительно защищены пузырчатой плёнкой. Упаковка
              подходит для подарка — попросите добавить открытку при
              оформлении заказа.
            </p>
          </div>
        </div>
      </section>

      {/* ── Уход ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-xs text-stone-400 tracking-[0.2em] uppercase">
              Уход
            </p>
          </div>
          <div className="md:col-span-8 lg:col-span-9">
            <ul className="space-y-6">
              {CARE_ITEMS.map((item, i) => (
                <li key={i} className="flex gap-4 items-start">
                  <span className="mt-2 w-1 h-1 rounded-full bg-stone-400 shrink-0" />
                  <p className="font-body text-sm text-stone-500 leading-relaxed">
                    {item}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

    </div>
  )
}
