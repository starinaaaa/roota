import type { Metadata } from "next";
import Link from "next/link";
import { marketPreviewScreens } from "@/lib/market/preview";
export const metadata: Metadata = {
  title: "Просмотр страниц маркета · Roota",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main className="market-preview-index">
      <h1>Страницы маркета</h1>
      <p>Демонстрационные покупки. Платежи и письма не создаются.</p>
      <nav aria-label="Состояния маркета">
        {Object.entries(marketPreviewScreens)
          .filter(([key]) => key !== "receipt-document")
          .map(([key, label]) => (
            <Link key={key} href={`/market/preview/${key}`}>
              {label} ↗
            </Link>
          ))}
        <Link href="/market/hello">Телефон · сайт и Instagram ↗</Link>
      </nav>
    </main>
  );
}
