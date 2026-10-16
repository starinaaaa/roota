// Read-only inventory + CDN HEAD requests. Writes only the local allowlist.
// Run with production DATABASE_* env: node --conditions=react-server --import tsx scripts/verify-cdn-images.ts
import { writeFile } from "node:fs/promises";
import { getPool } from "../lib/db/pool";
import { imageCdnOrigin, imageCdnPath } from "../lib/image-cdn";
import { imageWidths, imageVariantVersion } from "../lib/image-sizes";

async function main() {
  const db = getPool();
  try {
    const client = await db.connect();
    const candidates: { src: string; bucket: string; storage_path: string }[] =
      [];
    try {
      await client.query("BEGIN READ ONLY");
      const images =
        await client.query(`SELECT i.product_id, i.id, i.bucket, i.storage_path
        FROM product_images i JOIN products p ON p.id = i.product_id
        WHERE p.publication_status = 'published' AND p.is_active = true`);
      for (const row of images.rows)
        candidates.push({ ...row, src: `/media/${row.product_id}/${row.id}` });
      const page = await client.query(
        "SELECT payload->>'heroImage' AS image FROM site_pages WHERE id = 1",
      );
      const hero = page.rows[0]?.image;
      if (typeof hero === "string" && imageCdnPath(hero)) {
        candidates.push({
          src: hero,
          bucket: "product-drafts",
          storage_path: `site/${hero.split("/").pop()}.webp`,
        });
      }
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    const images: Record<string, number[]> = {};
    for (const image of candidates) {
      const path = imageCdnPath(image.src);
      if (
        !path ||
        image.bucket !== "product-drafts" ||
        path !== `${image.bucket}/${image.storage_path}`
      )
        continue;
      const verified = await Promise.all(
        imageWidths.map(async (width) => {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const response = await fetch(
                `${imageCdnOrigin}/${path}.v${imageVariantVersion}.w${width}.webp`,
                {
                  method: "HEAD",
                  redirect: "error",
                  signal: AbortSignal.timeout(15_000),
                },
              );
              if (
                response.ok &&
                response.headers.get("content-type")?.split(";")[0] ===
                  "image/webp" &&
                Number(response.headers.get("content-length")) > 0
              )
                return width;
              if (response.status === 404 || response.status === 403)
                return null;
            } catch {
              /* A transient CDN failure must not approve a variant. */
            }
          }
          return null;
        }),
      );
      const widths = verified.filter(
        (width): width is NonNullable<typeof width> => width !== null,
      );
      if (widths.length) images[image.src] = widths;
    }
    await writeFile(
      new URL("../lib/cdn-image-manifest.json", import.meta.url),
      `${JSON.stringify({ version: imageVariantVersion, images }, null, 2)}\n`,
    );
    console.log({
      candidates: candidates.length,
      cdnImages: Object.keys(images).length,
      verifiedVariants: Object.values(images).flat().length,
    });
  } finally {
    await db.end();
  }
}
void main();
