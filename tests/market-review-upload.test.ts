import test from "node:test";
import assert from "node:assert/strict";
import { readMarketReviewMultipart } from "../lib/market/review-photos";
const url = "http://localhost:3167/api/market/review/" + "a".repeat(64);
const request = (form: FormData, origin = "http://localhost:3167") =>
  new Request(url, { method: "POST", body: form, headers: { origin } });
test("market multipart review keeps explicit choices and blocks cross-origin while accepting many large photos", async () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3167";
  try {
    const form = new FormData();
    form.set("displayName", "Анна");
    form.set("accepted", "true");
    form.set("publicationConsent", "false");
    form.append(
      "photos",
      new File(["fixture"], "plate.jpg", { type: "image/jpeg" }),
    );
    const parsed = await readMarketReviewMultipart(request(form));
    assert.equal(parsed.photos.length, 1);
    assert.equal(parsed.body.accepted, true);
    assert.equal(parsed.body.publicationConsent, false);
    await assert.rejects(
      readMarketReviewMultipart(request(form, "https://other.example")),
      /Недопустимый/,
    );
    const many = new FormData();
    for (let i = 0; i < 12; i++)
      many.append(
        "photos",
        new File([new Uint8Array(2 * 1024 * 1024)], `plate-${i}.jpg`, {
          type: "image/jpeg",
        }),
      );
    many.append(
      "photos",
      new File([new Uint8Array(4 * 1024 * 1024)], "large.jpg", {
        type: "image/jpeg",
      }),
    );
    const large = await readMarketReviewMultipart(request(many));
    assert.equal(large.photos.length, 13);
    assert.equal(large.photos[12].size, 4 * 1024 * 1024);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original;
  }
});
