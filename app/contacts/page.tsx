import { ArrowUpRight } from "lucide-react";
import CharacterArt from "@/components/illustrations/CharacterArt";
import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/contacts" },
  title: "Контакты",
  description:
    "Свяжитесь с Roota ceramics в Telegram, по электронной почте или в Instagram. Ответим в течение суток.",
};

export default async function ContactsPage() {
  const site = await getSiteContent();
  const contacts = [
    {
      label: "Telegram",
      value: `@${new URL(site.telegram).pathname.replace(/^\//, "").replace(/\/$/, "")}`,
      href: site.telegram,
      external: true,
    },
    {
      label: "Email",
      value: site.email,
      href: `mailto:${site.email}`,
      external: false,
    },
    {
      label: "Instagram",
      value: `@${new URL(site.instagram).pathname.replace(/^\//, "").replace(/\/$/, "")}`,
      href: site.instagram,
      external: true,
    },
  ];

  return (
    <div className="pt-16 md:pt-20">
      <section
        aria-labelledby="contacts-title"
        className="px-6 py-12 md:px-12 md:py-20 lg:px-16"
      >
        <div className="mx-auto grid max-w-[1440px] gap-10 md:grid-cols-12 md:gap-8">
          <div className="relative md:col-span-5">
            <p className="mb-5 font-body text-caption uppercase tracking-[0.08em] text-stone-600 md:mb-6">
              Контакты
            </p>
            <h1
              id="contacts-title"
              className="max-w-sm font-display text-page leading-[1.12] text-stone-900"
            >
              Напишите<br />нам
            </h1>
            <p className="mt-5 font-body text-copy text-stone-600">
              Ответим в течение суток.
            </p>
            <CharacterArt
              character="flower"
              className="absolute right-0 top-20 h-16 w-16 -rotate-3 md:static md:mt-8 md:h-36 md:w-36"
            />
          </div>

          <div className="min-w-0 md:col-span-6 md:col-start-7 md:pt-1">
            <ul className="border-t border-stone-300">
              {contacts.map(({ label, value, href, external }) => (
                <li key={label} className="border-b border-stone-300">
                  <a
                    href={href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="group flex min-h-28 items-center justify-between gap-5 py-6 transition-colors duration-200 hover:text-stone-500 md:min-h-32 md:py-7"
                  >
                    <span className="min-w-0">
                      <span className="mb-2 block font-body text-caption uppercase tracking-[0.08em] text-stone-600">
                        {label}
                      </span>
                      <span className="block font-body text-price leading-snug [overflow-wrap:anywhere]">
                        {value}
                      </span>
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      strokeWidth={1}
                      className="h-6 w-6 shrink-0 motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
                    />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-xl font-body text-ui leading-relaxed text-stone-600 md:mt-8">
              По вопросам возврата или повреждения посылки напишите на{" "}
              <a
                href={`mailto:${site.email}`}
                className="underline underline-offset-4 transition-colors hover:text-stone-900 [overflow-wrap:anywhere]"
              >
                {site.email}
              </a>{" "}
              и укажите номер заказа. Сообщим порядок действий.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
