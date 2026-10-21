import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
      "terms",
      "privacy",
      "personal-data-policy",
      "newsletter-consent",
      "newsletter-data-consent",
    ].sort(),
  );
  const bytes = await readFile(`lib/legal-documents/${LEGAL_VERSION}.json`);
  // Once released, change the version and add a snapshot instead of editing the accepted text.
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "4f8799e1e6fdf1c31fb06a91f1b5eb565b25f524394913d728abb4ec47bc5003",
  );
});
