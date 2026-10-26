import Link from "next/link";
import type { Metadata } from "next";
import { Jost, Unbounded } from "next/font/google";
import { ShopProvider, Navigation } from "../components/Shop";
import "./style.css";
const body = Jost({
  subsets: ["latin", "cyrillic"],
  variable: "--body",
  display: "swap",
});
const display = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400"],
  variable: "--display",
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "Roota — керамика с историей", template: "%s · Roota" },
  robots: { index: false, follow: false, noarchive: true },
  icons: { icon: "/icon.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${body.variable} ${display.variable}`}>
      <body>
        <ShopProvider>
          <div className="demo-note">
            Версия для просмотра · покупки и оплата демонстрационные
          </div>
          <Navigation />
          <main id="main">{children}</main>
          <footer>
            <Link className="wordmark" href="/">
              Roota<span>ceramics</span>
            </Link>
            <p>
              Авторская керамика Даши Равнушкиной.
              <br />
              Тарелки с историями и сады для игры.
            </p>
            <nav aria-label="Внизу страницы">
              <Link href="/collection/plates">Тарелки</Link>
              <Link href="/product/sad">Сад</Link>
              <Link href="/about">О Даше</Link>
              <Link href="/delivery">Доставка и оплата</Link>
            </nav>
            <small>© 2026 Roota · Демонстрационный магазин</small>
          </footer>
        </ShopProvider>
      </body>
    </html>
  );
}
