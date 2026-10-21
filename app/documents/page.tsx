import Link from "next/link";
import type { Metadata } from "next";
import { legalArchives } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "Редакции документов",
  robots: { index: false, follow: true },
};

export default function DocumentsPage() {
  return (
    <div className="pt-28 md:pt-36 pb-16 px-6 md:px-12 max-w-4xl mx-auto">
      <h1 className="font-display text-section mb-8">Редакции документов</h1>
      <p className="font-body text-ui text-stone-600 mb-10">
        Редакция, принятая при оформлении, сохраняется в заказе. Ниже доступны
        тексты, которые соответствуют указанной версии. Редакции, действовавшие
        до начала ведения этого архива, здесь не восстановлены.
      </p>
      {Object.values(legalArchives).map((edition) => (
        <section
          key={edition.version}
          className="border-t border-stone-200 pt-6"
        >
          <h2 className="font-display text-price mb-5">{edition.updatedAt}</h2>
          <ul className="font-body text-ui space-y-4">
            {Object.entries(edition.documents).map(([slug, doc]) => (
              <li key={slug}>
                <Link
                  href={`/documents/${edition.version}/${slug}`}
                  className="underline underline-offset-4 hover:text-stone-600"
                >
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
