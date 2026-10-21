import { bindPrepositions } from "@/lib/typography";
import CharacterArt from "@/components/illustrations/CharacterArt";
import Link from "next/link";
import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site";
import { paymentMode } from "@/lib/payments/robokassa";
import { paymentInformation } from "@/lib/payments/public-mode";
import { COURIER_DESCRIPTION, RETURN_INSTRUCTIONS } from "@/lib/shop-policies";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/delivery" },
  title: "Доставка и оплата",
  description:
    "Условия доставки, оплаты, упаковки и ухода за керамикой Roota ceramics.",
};

const CARE_ITEMS = [
  {
    title: "Бережное мытьё",
    text: "Перед первым использованием вымойте посуду. Для ежедневного ухода подойдут тёплая вода, мягкая губка и обычное средство для посуды. Не используйте металлические губки и абразивные порошки: они могут поцарапать глазурь.",
  },
  {
    title: "Без резких перепадов температуры",
    text: "Дайте горячей посуде остыть перед мытьём. Не ставьте её в холодную воду и не нагревайте сразу после холодильника — резкая смена температуры может привести к трещинам.",
  },
  {
    title: "Посудомойка и микроволновка",
    text: "Можно ли мыть изделие в посудомоечной машине и разогревать в микроволновке, указано в его карточке. Ориентируйтесь на рекомендации для выбранного изделия.",
  },
];

export default async function DeliveryPage() {
  const site = await getSiteContent();
  const payment = paymentInformation(paymentMode());
  return (
    <div className="pt-16 md:pt-20">
      {/* ── Заголовок ── */}
      <section className="py-12 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid gap-8 md:grid-cols-[1.2fr_1fr] items-center">
          <div>
            <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase mb-5 md:mb-8">
              Информация
            </p>
            <h1 className="font-display text-page leading-[1.05] text-stone-900 max-w-2xl">
              Доставка
              <br />
              и оплата
            </h1>
          </div>
          <div
            aria-hidden="true"
            className="relative hidden md:block md:h-64 lg:h-72 w-full max-w-md justify-self-end"
          >
            <CharacterArt
              character="skater"
              loading="eager"
              className="absolute bottom-0 left-0 h-40 w-32 md:h-56 md:w-44 -rotate-6"
            />
            <CharacterArt
              character="resting"
              loading="eager"
              className="absolute right-0 top-0 h-36 w-48 md:h-48 md:w-64 rotate-6"
            />
          </div>
        </div>
      </section>

      <section className="border-t border-stone-200 px-6 md:px-12 lg:px-16 py-10 md:py-14">
        <div className="max-w-[1440px] mx-auto">
          <h2 className="font-body text-ui tracking-[0.08em] uppercase mb-8">
            Как получить заказ
          </h2>
          <p className="font-body text-copy leading-relaxed text-stone-800 mb-8 max-w-2xl">
            Доставляем в пункты Ozon и курьером Яндекс Доставки по Москве и
            Подмосковью. Курьерскую доставку согласуем с вами в Telegram; вы
            оплачиваете её отдельно в приложении. Скоро добавим другие службы
            доставки.
          </p>
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                "Оформление",
                "Добавьте изделия в корзину и выберите способ доставки. Для Ozon укажите пункт выдачи, для курьера — адрес и Telegram.",
              ],
              [
                "Оплата",
                "Проверьте итоговую сумму и оплатите через Robokassa. Готовые изделия резервируются на 30 минут.",
              ],
              [
                "Отправка",
                "В Ozon передаём готовые изделия за 1–3 рабочих дня после оплаты. Время отправки курьером согласуем с вами. Срок изготовления предзаказа указан в карточке.",
              ],
              [
                "Получение",
                "Ozon пришлёт уведомление, когда заказ поступит в пункт выдачи. Если выбрали курьера, свяжемся с вами в Telegram и согласуем удобное время доставки.",
              ],
            ].map(([title, text], index) => (
              <li key={title} className="space-y-3">
                <h3 className="font-display text-price">
                  {index + 1}. {title}
                </h3>
                <p className="font-body text-copy leading-relaxed text-stone-800">
                  {bindPrepositions(text)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      {/* ── Доставка ── */}
      <section className="border-t border-stone-200 py-12 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <h2 className="font-body text-ui text-stone-800 tracking-[0.08em] uppercase">
              Доставка
            </h2>
          </div>
          <div className="md:col-span-8 lg:col-span-9">
            <div className="divide-y divide-stone-200">
              {[
                ...site.delivery,
                {
                  title: "Курьер Яндекс Доставки",
                  text: COURIER_DESCRIPTION,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="py-6 md:py-8 first:pt-0 last:pb-0 space-y-3 max-w-2xl"
                >
                  <h3 className="font-display text-price text-stone-900">
                    {bindPrepositions(
                      item.title.replace(/^доставка\s+озон$/iu, "Ozon"),
                    )}
                  </h3>
                  <p className="font-body text-copy text-stone-800 leading-relaxed">
                    {bindPrepositions(item.text)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Оплата ── */}
      <section className="border-t border-stone-200 py-12 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <h2 className="font-body text-ui text-stone-800 tracking-[0.08em] uppercase">
              Оплата
            </h2>
          </div>
          <div className="md:col-span-8 lg:col-span-9">
            <div className="space-y-3 max-w-2xl">
              <h3 className="font-display text-price text-stone-900">
                {bindPrepositions(payment.title)}
              </h3>
              <p className="font-body text-copy text-stone-800 leading-relaxed">
                {bindPrepositions(payment.text)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="returns"
        className="scroll-mt-28 border-t border-stone-200 px-6 md:px-12 lg:px-16 py-10 md:py-14"
      >
        <div className="max-w-[1440px] mx-auto space-y-5">
          <h2 className="font-display text-price">Повреждение и возврат</h2>
          <p className="font-body text-copy leading-relaxed max-w-2xl">
            Если изделие повредилось в дороге, напишите на {site.email} и
            укажите номер заказа. По возможности приложите фотографии изделия и
            упаковки — они помогут разобраться. Отсутствие видео распаковки само
            по себе не является основанием для отказа в обращении.
          </p>
          <p className="font-body text-ui leading-relaxed max-w-2xl">
            {bindPrepositions(RETURN_INSTRUCTIONS)}
          </p>
          <div className="flex flex-wrap gap-6 font-body text-ui underline underline-offset-4">
            <a href={site.telegram} target="_blank" rel="noopener noreferrer">
              Написать в Telegram
            </a>
            <Link href="/offer#returns" prefetch={false}>
              Условия возврата
            </Link>
          </div>
        </div>
      </section>
      {/* ── Упаковка ── */}
      <section className="border-t border-stone-200 py-10 md:py-28 px-6 md:px-12 lg:px-16 bg-stone-100">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8">
          <div className="flex items-center justify-between gap-6 md:block md:col-span-4 lg:col-span-3">
            <h2 className="font-body text-ui text-stone-800 tracking-[0.08em] uppercase">
              Упаковка
            </h2>
            <CharacterArt
              character="walker"
              className="h-20 w-12 shrink-0 md:mt-8 md:h-40 md:w-24"
            />
          </div>
          <div className="md:col-span-8 lg:col-span-9 max-w-xl">
            <p className="font-body text-copy text-stone-800 leading-relaxed">
              {bindPrepositions(
                "Каждое изделие бережно заворачиваем в сотовый крафт. Для отправки добавляем пузырчатую плёнку и наполнитель, затем укладываем в картонную коробку, чтобы защитить керамику в дороге.",
              )}
            </p>
          </div>
        </div>
      </section>

      {/* ── Уход ── */}
      <section className="border-t border-stone-200 py-10 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8">
          <div className="flex items-center justify-between gap-6 md:block md:col-span-4 lg:col-span-3">
            <h2 className="font-body text-ui text-stone-800 tracking-[0.08em] uppercase">
              Уход
            </h2>
            <CharacterArt
              character="watering"
              className="h-20 w-[88px] shrink-0 md:mt-8 md:h-40 md:w-44"
            />
          </div>
          <div className="md:col-span-8 lg:col-span-9 max-w-2xl">
            <p className="font-body text-copy text-stone-800 leading-relaxed mb-6">
              {bindPrepositions(
                "Наши тарелки сделаны из высокотемпературной глины и покрыты прозрачной глазурью. Несколько простых правил помогут сохранить их надолго.",
              )}
            </p>
            <ul className="divide-y divide-stone-200">
              {CARE_ITEMS.map(({ title, text }) => (
                <li key={title} className="py-5 first:pt-0 last:pb-0 space-y-2">
                  <h3 className="font-body text-ui text-stone-900">
                    {bindPrepositions(title)}
                  </h3>
                  <p className="font-body text-ui md:text-copy text-stone-800 leading-relaxed">
                    {bindPrepositions(text)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
