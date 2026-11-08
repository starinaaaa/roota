import test from "node:test";
import assert from "node:assert/strict";
import { readMarketReviewMultipart } from "../lib/market/review-photos";
const url = "http://localhost:3167/api/market/review/" + "a".repeat(64);
const request = (form: FormData, origin = "http://localhost:3167") =>
  new Request(url, { method: "POST", body: form, headers: { origin } });
test("market multipart review keeps explicit choices and blocks cross-origin and oversized bodies", async () => {
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
    const large = new Request(url, {
      method: "POST",
      body: new Uint8Array(16 * 1024 * 1024),
      headers: {
        origin: "http://localhost:3167",
        "content-type": "multipart/form-data; boundary=test",
      },
    });
    await assert.rejects(readMarketReviewMultipart(large), /Слишком большой/);
    const six = new FormData();
    for (let i = 0; i < 6; i++)
      six.append(
        "photos",
        new File(["fixture"], "plate.jpg", { type: "image/jpeg" }),
      );
    await assert.rejects(readMarketReviewMultipart(request(six)), /больше 5/);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original;
  }
});
