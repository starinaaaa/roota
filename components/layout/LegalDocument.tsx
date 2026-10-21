import Link from "next/link";
import { bindPrepositions } from "@/lib/typography";
import { LEGAL_DATE_LABEL, LEGAL_VERSION } from "@/lib/legal";
import type { LegalSection } from "@/lib/legal-documents";

const documentLinks = [
  ["/personal-data-policy", "Политика обработки данных"],
  ["/newsletter-data-consent", "согласие на обработку email"],
  ["/newsletter-consent", "согласие на получение писем"],
  ["/privacy", "Политика конфиденциальности"],
  ["/offer", "Публичная оферта"],
  ["/terms", "Пользовательское соглашение"],
  ["/cookies", "Файлы cookie"],
] as const;

function DocumentText({ text }: { text: string }) {
  // Only known internal document URLs are linked; arbitrary text remains text.
  return text
    .split(
      /((?:https:\/\/roota\.moscow)?\/(?:personal-data-policy|newsletter-data-consent|newsletter-consent|privacy|offer|terms|cookies))\b/g,
    )
    .map((part, i) => {
      const path = part.replace("https://roota.moscow", "");
      const link = documentLinks.find(([href]) => href === path);
      return link ? (
        <Link
          key={i}
          href={path}
          className="underline underline-offset-4 hover:text-stone-950"
        >
          {link[1]}
        </Link>
      ) : (
        bindPrepositions(part)
      );
    });
}

export default function LegalDocument({
  title,
  sections,
  updatedAt = LEGAL_DATE_LABEL,
  version = LEGAL_VERSION,
  archived = false,
}: {
  title: string;
  updatedAt?: string;
  version?: string;
  archived?: boolean;
  sections: LegalSection[];
}) {
  return (
    <div className="pt-16 md:pt-20 [overflow-wrap:anywhere]">
      <section className="py-10 md:py-24 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto">
          <p className="font-body text-caption text-stone-600 uppercase mb-8">
            Документы
          </p>
          <h1 className="font-display text-page leading-[1.05] text-stone-900 max-w-4xl">
            {bindPrepositions(title)}
          </h1>
        </div>
      </section>
      <section className="border-t border-stone-200 py-10 md:py-24 px-6 md:px-12 lg:px-16">
        <div className="max-w-[1440px] mx-auto grid md:grid-cols-12 gap-10">
          <nav
            aria-label="Документы студии"
            className="md:col-span-4 lg:col-span-3 flex flex-col items-start gap-4 font-body text-ui text-stone-800"
          >
            {documentLinks.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="hover:underline underline-offset-4"
              >
                {label}
              </Link>
            ))}
            <Link href="/documents" className="underline underline-offset-4">
              Редакции документов
            </Link>
          </nav>
          <div className="min-w-0 md:col-span-8 lg:col-span-9 max-w-2xl space-y-12">
            {archived && (
              <p className="font-body text-ui text-stone-600">
                Сохранённая редакция {version}. Текущие условия доступны в меню
                документов.
              </p>
            )}
            {sections.map((section) => (
              <section
                key={section.heading}
                id={section.id}
                className="scroll-mt-28"
              >
                <h2 className="font-body text-caption uppercase text-stone-600 mb-5">
                  {bindPrepositions(section.heading)}
                </h2>
                <div className="space-y-4">
                  {section.paragraphs.map((p) => (
                    <p
                      key={p}
                      className="font-body text-copy text-stone-800 leading-loose whitespace-pre-line"
                    >
                      <DocumentText text={p} />
                    </p>
                  ))}
                </div>
              </section>
            ))}
            <p className="border-t border-stone-200 pt-8 font-body text-caption text-stone-600">
              Последнее обновление: {updatedAt}. Редакция: {version}.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
