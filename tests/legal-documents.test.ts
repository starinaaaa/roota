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
    "9a41d40c3a09b3245b6409a010411dd402742c3d1393239f36dc026ca97eb18a",
  );
});
