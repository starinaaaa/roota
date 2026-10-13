import test from "node:test";
import assert from "node:assert/strict";
import { createSiteImageCache } from "../lib/site-image-cache";

test("hero cache shares downloads, retries failures, expires and stays bounded", async () => {
  let time = 0,
    downloads = 0;
  const cache = createSiteImageCache(100, 2, () => time);
  const load = async () => {
    downloads++;
    return new Blob(["image"], { type: "image/webp" });
  };
  const [first, duplicate] = await Promise.all([
    cache("a", load),
    cache("a", load),
  ]);
  assert.equal(first, duplicate);
  assert.equal(downloads, 1);
  time = 101;
  await cache("a", load);
  assert.equal(downloads, 2);
  await cache("b", load);
  await cache("c", load);
  await cache("a", load);
  assert.equal(downloads, 5);
  await assert.rejects(
    cache("failed", async () => {
      throw new Error("network");
    }),
    /network/,
  );
  assert.equal((await cache("failed", load)).size, 5);
});

test("a stalled hero request cannot poison the cache and can be retried", async () => {
  const cache = createSiteImageCache(100, 2, Date.now, 5);
  await assert.rejects(
    cache("image", () => new Promise<Blob>(() => {})),
    /SITE_IMAGE_TIMEOUT/,
  );
  assert.equal((await cache("image", async () => new Blob(["retry"]))).size, 5);
});
