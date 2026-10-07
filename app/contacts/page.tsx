import { bindPrepositions } from "@/lib/typography";
import CharacterArt from "@/components/illustrations/CharacterArt";
import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site";
import { seller } from "@/lib/seller";

export const metadata: Metadata = {
  alternates: { canonical: "/contacts" },
  title: "Контакты",
  description:
    "Контакты студии Roota ceramics — email, Telegram, Instagram. Индивидуальные заказы и сотрудничество.",
};

export default async function ContactsPage() {
  const site = await getSiteContent();
  const CONTACTS = [
    {
      label: "Телефон",
      value: seller.phone,
      href: seller.phoneHref,
      external: false,
    },
    {
      label: "Email",
      value: site.email,
      href: "mailto:" + site.email,
      external: false,
    },
    {
      label: "Telegram",
      value: site.telegram,
      href: site.telegram,
      external: true,
    },
    {
      label: "Instagram",
      value: site.instagram,
      href: site.instagram,
      external: true,
    },
  ];
  return (
    <div className="pt-16 md:pt-20">
      {/* ── Заголовок ── */}
      <section className="py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid gap-8 md:grid-cols-[1.3fr_1fr] items-center">
          <div>
            <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase mb-8">
              Контакты
            </p>
            <h1 className="font-display text-page leading-[1.05] text-stone-900 max-w-xl">
              Напишите нам
            </h1>
          </div>
          <CharacterArt
            character="flower"
            className="h-44 w-44 md:h-64 md:w-64 justify-self-end md:mr-12 -rotate-3"
          />
        </div>
      </section>

      {/* ── Контакты ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase">
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
                  <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase">
                    {bindPrepositions(label)}
                  </p>
                  <a
                    href={href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="sm:col-span-2 font-body text-ui text-stone-900 hover:text-stone-600 transition-colors duration-200"
                  >
                    {bindPrepositions(value)}
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
            <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase">
              Студия
            </p>
          </div>
          <div className="md:col-span-8 lg:col-span-9 max-w-xl">
            <p className="font-body text-copy text-stone-900 mb-3">Москва</p>
            <p className="font-body text-copy text-stone-900 mb-3">
              Самозанятый {bindPrepositions(seller.name)}. ИНН{" "}
              {bindPrepositions(seller.inn)}.
            </p>
            <p className="font-body text-copy text-stone-800 leading-loose">
              Мы работаем по предварительной записи. Посещение мастерской
              возможно — напишите нам, чтобы договориться о времени.
            </p>
          </div>
        </div>
      </section>

      {/* ── Индивидуальные заказы ── */}
      <section className="border-t border-stone-200 py-20 md:py-28 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
          <div className="md:col-span-4 lg:col-span-3">
            <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase">
              Сотрудничество
            </p>
          </div>
          <div className="md:col-span-8 lg:col-span-9 max-w-xl space-y-8">
            <p className="font-body text-copy text-stone-800 leading-loose">
              Мы открыты для индивидуальных заказов и коллабораций. Сервиз
              для ресторана, подарочный набор, корпоративный заказ — расскажите
              о своей идее, и мы обсудим детали.
            </p>
            <a
              href={"mailto:" + site.email}
              className="inline-block font-body text-caption tracking-[0.08em] uppercase bg-stone-900 text-stone-50 px-8 py-4 hover:bg-stone-700 transition-colors duration-300"
            >
              Написать письмо
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
