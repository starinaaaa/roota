import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LegalDocument from "@/components/layout/LegalDocument";
import { legalArchives } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "Сохранённая редакция документа",
  robots: { index: false, follow: true },
};

export default async function ArchivedDocument({
  params,
}: {
  params: Promise<{ version: string; document: string }>;
}) {
  const { version, document } = await params;
  const edition = Object.hasOwn(legalArchives, version)
    ? legalArchives[version]
    : undefined;
  const content =
    edition && Object.hasOwn(edition.documents, document)
      ? edition.documents[document]
      : undefined;
  if (!edition || !content) notFound();
  return (
    <LegalDocument
      {...content}
      updatedAt={edition.updatedAt}
      version={version}
      archived
    />
  );
}
