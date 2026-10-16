import { test } from "node:test";
import assert from "node:assert/strict";
import imageLoader, { fallbackImageLoader } from "../lib/image-loader";
import { imageCdnPath, cdnImageUrl, imageCdnOrigin } from "../lib/image-cdn";
import manifest from "../lib/cdn-image-manifest.json";
import local from "../lib/local-image-manifest.json";
import { imageVariantVersion, imageWidths } from "../lib/image-sizes";

test("only exact internal UUID routes produce CDN paths", () => {
  for (const src of [
    "https://example.org/media/x/y",
    "//example.org/media/x/y",
    "/media/not-a-uuid/x",
    "/site-media/../x",
    "/site-media/1ec70882-50b8-42a5-9971-68a00f54401c?x=1",
  ]) {
    assert.equal(imageCdnPath(src), undefined);
    assert.equal(cdnImageUrl(src, 960), undefined);
  }
});

test("verified variants use prepared widths and the shared version", () => {
  assert.equal(manifest.version, imageVariantVersion);
  assert.ok(Object.keys(manifest.images).length > 0);
  for (const [src, widths] of Object.entries(manifest.images)) {
    for (const width of widths) {
      assert.ok(imageWidths.includes(width as (typeof imageWidths)[number]));
      assert.equal(
        imageLoader({ src, width }),
        `${imageCdnOrigin}/${imageCdnPath(src)}.v${imageVariantVersion}.w${width}.webp`,
      );
    }
    if (widths.includes(960))
      assert.equal(imageLoader({ src, width: 828 }), cdnImageUrl(src, 960));
  }
});

test("unverified images retain the compatibility route; fallback bypasses CDN", () => {
  const src =
    "/media/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002";
  assert.equal(
    imageLoader({ src, width: 750 }),
    `${src}?w=960&v=${imageVariantVersion}`,
  );
  for (const known of Object.keys(manifest.images))
    assert.equal(
      fallbackImageLoader({ src: known, width: 750 }),
      `${known}?w=960&v=${imageVariantVersion}`,
    );
  assert.equal(
    imageLoader({ src: "https://example.org/photo.webp", width: 960 }),
    "https://example.org/photo.webp",
  );
});

test("local manifest URLs are unchanged", () => {
  for (const [src, path] of Object.entries(local))
    assert.equal(imageLoader({ src, width: 750 }), `${path}-960.webp`);
});
