import test from "node:test";
import assert from "node:assert/strict";
import { reviewUploadRejection } from "../lib/review-upload";
test("photo upload routes retain trusted-origin, read-only preview and maintenance restrictions outside Proxy", () => {
  const keys = [
    "NEXT_PUBLIC_SITE_URL",
    "ROOTA_REVIEW_HOST",
    "APP_ENV",
    "MIGRATION_MAINTENANCE",
  ] as const;
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://roota.example";
    delete process.env.ROOTA_REVIEW_HOST;
    delete process.env.MIGRATION_MAINTENANCE;
    const request = new Request("https://roota.example/api/reviews/token", {
      method: "POST",
      headers: { origin: "https://roota.example" },
    });
    assert.equal(reviewUploadRejection(request), null);
    assert.equal(
      reviewUploadRejection(
        new Request(request.url, {
          method: "POST",
          headers: { origin: "https://other.example" },
        }),
      )?.status,
      400,
    );
    process.env.ROOTA_REVIEW_HOST = "roota.example";
    assert.equal(reviewUploadRejection(request)?.status, 405);
    delete process.env.ROOTA_REVIEW_HOST;
    process.env.APP_ENV = "migration";
    process.env.MIGRATION_MAINTENANCE = "true";
    assert.equal(reviewUploadRejection(request)?.status, 503);
  } finally {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});
