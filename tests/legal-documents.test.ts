import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { returnInstructionsForVersion } from "../lib/shop-policies";
import { currentLegalDocuments, legalArchives } from "../lib/legal-documents";
import {
  EMAIL_CONSENT_VERSION,
  LEGAL_DATE_LABEL,
  LEGAL_VERSION,
} from "../lib/legal";

test("published legal edition and email consent version resolve to a preserved complete document set", async () => {
  assert.equal(currentLegalDocuments.version, LEGAL_VERSION);
  assert.equal(currentLegalDocuments.updatedAt, LEGAL_DATE_LABEL);
  assert.equal(
    currentLegalDocuments.emailConsentVersion,
    EMAIL_CONSENT_VERSION,
  );
  assert.deepEqual(
    Object.keys(legalArchives[LEGAL_VERSION].documents).sort(),
    [
      "offer",
      "privacy",
      "newsletter-consent",
      "newsletter-data-consent",
    ].sort(),
  );
  assert.equal(
    createHash("sha256")
      .update(await readFile("lib/legal-documents/2026-10-23-3.json"))
      .digest("hex"),
    "92765d8a84a3bb1ff42783daf91eb08ba6373eee4a67eb49d37780ae5879f915",
  );
  const bytes = await readFile(`lib/legal-documents/${LEGAL_VERSION}.json`);
  // Once released, change the version and add a snapshot instead of editing the accepted text.
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "3e805d437bd9f7469ce9b0ec8364196543cd356e5d1583702677e7662c4845ac",
  );
});

test("merged documents retain the accepted edition and current return terms", async () => {
  assert.equal(
    legalArchives["2026-10-23"].documents.terms.title,
    "Пользовательское соглашение",
  );
  assert.equal(
    createHash("sha256")
      .update(await readFile("lib/legal-documents/2026-10-23.json"))
      .digest("hex"),
    "9a41d40c3a09b3245b6409a010411dd402742c3d1393239f36dc026ca97eb18a",
  );
  assert.ok(
    currentLegalDocuments.documents.offer.sections.some(
      (section) => section.id === "order-messages",
    ),
  );
  assert.ok(
    currentLegalDocuments.documents.privacy.sections.some(
      (section) => section.id === "data-policy",
    ),
  );
  assert.match(returnInstructionsForVersion(LEGAL_VERSION), /7 дней/);
  assert.match(returnInstructionsForVersion("2026-10-21"), /14 дней/);
});
