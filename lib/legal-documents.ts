import current from "./legal-documents/2026-10-23-2.json";
import previous23 from "./legal-documents/2026-10-23.json";
import previous22 from "./legal-documents/2026-10-22.json";
import previous from "./legal-documents/2026-10-21.json";

export type LegalSection = {
  heading: string;
  paragraphs: string[];
  id?: string;
};
export type LegalDocumentContent = { title: string; sections: LegalSection[] };
export const currentLegalDocuments = current;
export const legalArchives: Record<
  string,
  {
    version: string;
    updatedAt: string;
    documents: Record<string, LegalDocumentContent>;
  }
> = {
  [current.version]: current,
  [previous23.version]: previous23,
  [previous.version]: previous,
  [previous22.version]: previous22,
};
