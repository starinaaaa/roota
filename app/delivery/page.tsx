import { bindPrepositions } from "@/lib/typography";
import CharacterArt from "@/components/illustrations/CharacterArt";
import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/delivery" },
  title: "Доставка и оплата",
  description:
    "Условия доставки, оплаты, упаковки и ухода за керамикой Roota ceramics.",
};

const CARE_ITEMS = [
  "Проверьте допустимость посудомоечной машины в карточке изделия.",
  "Допустимость микроволновой печи указана в карточке конкретного изделия.",
  "Не рекомендуется резкий перепад температур: не ставьте горячую посуду в холодную воду.",
  "Матовые глазури со временем приобретают патину — это нормально и красиво.",
];

export default async function DeliveryPage() {
  const site = await getSiteContent();
  return (
    <div className="pt-16 md:pt-20">
      {/* ── Заголовок ── */}
      <section className="py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid gap-8 md:grid-cols-[1.2fr_1fr] items-center">
          <div>
            <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase mb-8">
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
            className="relative h-48 md:h-64 lg:h-72 w-full max-w-md justify-self-end"
          >
            <CharacterArt
              character="skater"
              className="absolute bottom-0 left-0 h-40 w-32 md:h-56 md:w-44 -rotate-6"
            />
            <CharacterArt
              character="resting"
              className="absolute right-0 top-0 h-36 w-48 md:h-48 md:w-64 rotate-6"
            />
          </div>
        </div>
      </section>

      {/* ── Доставка ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <h2 className="font-body text-ui text-stone-800 tracking-[0.08em] uppercase">
              Доставка
            </h2>
          </div>
          <div className="md:col-span-8 lg:col-span-9">
            <div className="divide-y divide-stone-200">
              {site.delivery.map((item) => (
                <div
                  key={item.title}
                  className="py-8 first:pt-0 space-y-3 max-w-2xl"
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
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <h2 className="font-body text-ui text-stone-800 tracking-[0.08em] uppercase">
              Оплата
            </h2>
          </div>
          <div className="md:col-span-8 lg:col-span-9">
            <div className="divide-y divide-stone-200">
              {site.payment.map((item) => (
                <div
                  key={item.title}
                  className="py-8 first:pt-0 space-y-3 max-w-2xl"
                >
                  <h3 className="font-display text-price text-stone-900">
                    {bindPrepositions(item.title)}
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

      {/* ── Упаковка ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16 bg-stone-100">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <h2 className="font-body text-ui text-stone-800 tracking-[0.08em] uppercase">
              Упаковка
            </h2>
            <CharacterArt character="walker" className="mt-8 h-40 w-24" />
          </div>
          <div className="md:col-span-8 lg:col-span-9 max-w-xl">
            <p className="font-body text-copy text-stone-800 leading-loose">
              Каждое изделие упаковывается вручную: крафтовая бумага,
              наполнитель, фирменная коробка. Хрупкие предметы дополнительно
              защищены пузырчатой плёнкой. Упаковка подходит для подарка —
              попросите добавить открытку при оформлении заказа.
            </p>
          </div>
        </div>
      </section>

      {/* ── Уход ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <h2 className="font-body text-ui text-stone-800 tracking-[0.08em] uppercase">
              Уход
            </h2>
            <CharacterArt character="watering" className="mt-8 h-40 w-44" />
          </div>
          <div className="md:col-span-8 lg:col-span-9">
            <ul className="space-y-6">
              {CARE_ITEMS.map((item, i) => (
                <li key={i} className="flex gap-4 items-start">
                  <span className="mt-2 w-1 h-1 rounded-full bg-stone-400 shrink-0" />
                  <p className="font-body text-copy text-stone-800 leading-relaxed">
                    {bindPrepositions(item)}
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
