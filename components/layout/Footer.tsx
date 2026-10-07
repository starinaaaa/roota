import Link from "next/link";
import { getSiteContent } from "@/lib/site";
import { seller } from "@/lib/seller";

const SHOP_LINKS = [
  { href: "/catalog", label: "Каталог" },
  { href: "/catalog?category=plates", label: "Тарелки" },
  { href: "/catalog?category=glasses", label: "Стаканы" },
  { href: "/catalog?category=vases", label: "Вазы" },
  { href: "/catalog?category=decor", label: "Декор" },
];

const INFO_LINKS = [
  { href: "/about", label: "О студии" },
  { href: "/delivery", label: "Доставка и оплата" },
  { href: "/contacts", label: "Контакты" },
];

export default async function Footer() {
  const site = await getSiteContent();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-stone-100 border-t border-stone-200">
      <div className="px-6 md:px-12 lg:px-16 py-16 md:py-20">
        <div className="max-w-[1440px] mx-auto">
          {/* Верхняя часть */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-8 mb-16">
            {/* Логотип + описание */}
            <div className="col-span-2 md:col-span-1">
              <Link
                href="/"
                className="font-display text-price tracking-[0.08em] uppercase text-stone-900 block mb-4"
              >
                Roota
              </Link>
              <p className="font-body text-ui text-stone-800 leading-relaxed max-w-[200px]">
                Авторская керамика ручной работы. Москва.
              </p>
              <p className="font-body text-caption text-stone-600 leading-relaxed mt-4">
                Самозанятый {seller.name}
                <br />
                ИНН {seller.inn}
                <br />
                {seller.city}
              </p>
            </div>

            {/* Каталог */}
            <div>
              <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase mb-5">
                Каталог
              </p>
              <ul className="space-y-3">
                {SHOP_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="font-body text-ui text-stone-800 hover:text-stone-900 transition-colors duration-200"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Информация */}
            <div>
              <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase mb-5">
                Информация
              </p>
              <ul className="space-y-3">
                {INFO_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="font-body text-ui text-stone-800 hover:text-stone-900 transition-colors duration-200"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Контакты */}
            <div>
              <p className="font-body text-caption text-stone-600 tracking-[0.08em] uppercase mb-5">
                Связь
              </p>
              <ul className="space-y-3">
                <li>
                  <a
                    href={seller.phoneHref}
                    className="font-body text-ui text-stone-800 hover:text-stone-900 transition-colors duration-200"
                  >
                    {seller.phone}
                  </a>
                </li>
                <li>
                  <a
                    href={site.telegram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-ui text-stone-800 hover:text-stone-900 transition-colors duration-200"
                  >
                    Telegram
                  </a>
                </li>
                <li>
                  <a
                    href={site.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-ui text-stone-800 hover:text-stone-900 transition-colors duration-200"
                  >
                    Instagram
                  </a>
                </li>
                <li>
                  <a
                    href={"mailto:" + site.email}
                    className="font-body text-ui text-stone-800 hover:text-stone-900 transition-colors duration-200"
                  >
                    {site.email}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Нижняя полоса */}
          <div className="border-t border-stone-200 pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="font-body text-ui text-stone-800">
              © {year} Roota ceramics. Все права защищены.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/offer"
                className="font-body text-ui text-stone-800 hover:text-stone-600 transition-colors duration-200"
              >
                Оферта
              </Link>
              <Link
                href="/privacy"
                className="font-body text-ui text-stone-800 hover:text-stone-600 transition-colors duration-200"
              >
                Конфиденциальность
              </Link>
              <Link
                href="/terms"
                className="font-body text-ui text-stone-800 hover:text-stone-600 transition-colors duration-200"
              >
                Условия использования
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
