import Link from "next/link";
import { bindPrepositions } from "@/lib/typography";

export default function LegalDocument({
  title,
  sections,
}: {
  title: string;
  sections: { heading: string; paragraphs: string[] }[];
}) {
  return (
    <div className="pt-16 md:pt-20">
      <section className="py-16 md:py-24 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto">
          <p className="font-body text-caption text-stone-600 uppercase mb-8">
            Документы
          </p>
          <h1 className="font-display text-page leading-[1.05] text-stone-900 max-w-4xl">
            {bindPrepositions(title)}
          </h1>
        </div>
      </section>
      <section className="border-t border-stone-200 py-16 md:py-24 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid md:grid-cols-12 gap-10">
          <nav
            aria-label="Документы студии"
            className="md:col-span-4 lg:col-span-3 flex flex-col items-start gap-4 font-body text-ui text-stone-800"
          >
            <Link href="/offer">Публичная оферта</Link>
            <Link href="/terms">Пользовательское соглашение</Link>
            <Link href="/privacy">Политика конфиденциальности</Link>
            <Link href="/personal-data-policy">
              Обработка персональных данных
            </Link>
            <Link href="/newsletter-consent">Рекламные новости</Link>
          </nav>
          <div className="md:col-span-8 lg:col-span-9 max-w-2xl space-y-12">
            {sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-body text-caption uppercase text-stone-600 mb-5">
                  {bindPrepositions(section.heading)}
                </h2>
                <div className="space-y-4">
                  {section.paragraphs.map((p) => (
                    <p
                      key={p}
                      className="font-body text-copy text-stone-800 leading-loose whitespace-pre-line"
                    >
                      {bindPrepositions(p)}
                    </p>
                  ))}
                </div>
              </section>
            ))}
            <p className="border-t border-stone-200 pt-8 font-body text-caption text-stone-600">
              Последнее обновление: 11 октября 2026
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
