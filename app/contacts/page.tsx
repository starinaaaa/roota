import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
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
    <div className="px-6 pt-16 md:px-12 md:pt-20 lg:px-16">
      <div className="w-full pb-12 pt-9 md:pb-16 md:pt-14">
        <h1 className="font-display text-page text-stone-900">Контакты</h1>
        <p className="mt-5 font-body text-copy text-stone-600">
          Напишите нам — ответим в течение суток.
        </p>

        <ul className="mt-9 border-t border-stone-200 md:mt-12">
          {contacts.map(({ label, value, href, external }) => (
            <li key={label} className="border-b border-stone-200">
              <a
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="action-row group grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-2 py-7 transition-colors hover:text-stone-600 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_auto] md:gap-x-10 md:py-9"
              >
                <span className="col-span-2 font-body text-ui text-stone-600 md:col-span-1">
                  {label}
                </span>
                <span className="min-w-0 font-display text-price max-[360px]:text-[18px] [overflow-wrap:anywhere]">
                  {value}
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

        <div className="mt-7 grid gap-3 md:mt-9 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] md:gap-10">
          <h2 className="font-display text-price">О заказе</h2>
          <div className="max-w-2xl font-body text-copy text-stone-800">
            <p>
              Для возврата или при повреждении посылки напишите на почту и
              укажите номер заказа.
            </p>
            <Link
              href="/delivery"
              className="mt-3 inline-block py-1 underline underline-offset-4 transition-colors hover:text-stone-600"
            >
              Доставка, оплата и возврат
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
