import { bindPrepositions } from "@/lib/typography";
import { getSiteContent } from "@/lib/site";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Согласие на рассылку",
  description: "Условия добровольной подписки на новости студии Roota.",
};

export default async function NewsletterConsentPage() {
  const site = await getSiteContent();
  const SECTIONS = [
    {
      heading: "1. Добровольное согласие",
      paragraphs: [
        "Отмечая отдельный флажок подписки при оформлении заказа, я добровольно соглашаюсь получать новости и рекламные сообщения студии Roota от самозанятого Маточкина Никиты Романовича, ИНН 110208421550, город Москва, на указанный мной адрес электронной почты. Флажок по умолчанию не отмечен. Подписка не является условием покупки.",
      ],
    },
    {
      heading: "2. Обработка для подписки",
      paragraphs: [
        "Для этой цели я отдельно от оферты подтверждаю согласие Оператору на обработку моего адреса электронной почты и сведений о выборе подписки: сбор, запись, хранение, уточнение, использование для рассылки, блокирование, удаление и уничтожение с применением средств автоматизации. Данные заказа для его исполнения обрабатываются на другом правовом основании независимо от подписки.",
        "Информация о текущих поставщиках инфраструктуры, месте хранения данных и правах субъекта опубликована в политике на странице /privacy. Настоящее согласие не отменяет требований закона к локализации и трансграничной передаче данных.",
      ],
    },
    {
      heading: "3. Срок и отзыв",
      paragraphs: [
        `Согласие действует до отзыва или прекращения рассылки. Для отзыва достаточно написать на ${site.email} с просьбой отписать указанный адрес; рекламные сообщения прекращаются по получении требования. Отзыв не влияет на исполнение заказа и получение сервисных сообщений по нему. Данные подписки после прекращения основания подлежат удалению в установленные законом сроки.`,
      ],
    },
    {
      heading: "4. Оператор и контакты",
      paragraphs: [
        `Самозанятый Маточкин Никита Романович, ИНН 110208421550, город Москва. Телефон: +7 912 553-51-30. Электронная почта: ${site.email}. Редакция от 6 октября 2026 года.`,
      ],
    },
  ];

  return (
    <div className="pt-16 md:pt-20">
      {/* ── Заголовок ── */}
      <section className="py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto">
          <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase mb-8">
            Документы
          </p>
          <h1 className="font-display text-page leading-[1.05] text-stone-900 max-w-2xl">
            Согласие на рассылку
          </h1>
        </div>
      </section>

      {/* ── Содержание ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          {/* Левая колонка */}
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase sticky top-28">
              Рассылка
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
                  <h2 className="font-body text-caption tracking-[0.08em] uppercase text-stone-600 mb-5">
                    {bindPrepositions(section.heading)}
                  </h2>
                  <div className="space-y-4">
                    {section.paragraphs.map((p, i) => (
                      <p
                        key={i}
                        className="font-body text-copy text-stone-800 leading-loose"
                      >
                        {bindPrepositions(p)}
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
  );
}
