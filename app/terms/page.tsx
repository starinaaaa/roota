import type { Metadata } from "next";
import LegalDocument from "@/components/layout/LegalDocument";
import { currentLegalDocuments } from "@/lib/legal-documents";

const document = currentLegalDocuments.documents["terms"];
export const metadata: Metadata = {
  title: document.title,
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return <LegalDocument {...document} />;
}
