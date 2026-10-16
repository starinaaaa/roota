// Copies existing prepared files; never recompresses, overwrites or deletes them.
// node --conditions=react-server --env-file=<private S3 env> --import tsx scripts/publish-static-images.ts
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../lib/storage";
import manifest from "../lib/local-image-manifest.json";
import { aboutGallery } from "../lib/about-gallery";
import { imageWidths } from "../lib/image-sizes";
import { imageCdnOrigin } from "../lib/image-cdn";

async function main() {
  if (process.env.S3_BUCKET !== "edf40ed2-aaa8-4d8c-88e5-ddb30d2c5260")
    throw Error("UNEXPECTED_STATIC_BUCKET");
  const sources = [
    ...aboutGallery.map((photo) => photo.src),
    "/images/about/hero-plates.jpg",
  ];
  const published: string[] = [];
  for (const src of sources) {
    const base = (manifest as Record<string, string>)[src];
    if (!/^\/optimized\/[a-f0-9]{16}$/.test(base))
      throw Error("INVALID_STATIC_PATH");
    for (const width of imageWidths) {
      const path = `${base}-${width}.webp`;
      const bytes = await readFile(`public${path}`);
      const sha = createHash("sha256").update(bytes).digest("hex");
      const input = {
        Bucket: process.env.S3_BUCKET,
        Key: `site-static${path}`,
      };
      try {
        await s3Client().send(
          new PutObjectCommand({
            ...input,
            Body: bytes,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
            Metadata: { sha256: sha },
            IfNoneMatch: "*",
          }),
        );
      } catch (error) {
        if (
          ![409, 412].includes(
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode ?? 0,
          )
        )
          throw Error("STATIC_UPLOAD_FAILED");
        const existing = await s3Client().send(new HeadObjectCommand(input));
        if (existing.Metadata?.sha256 !== sha)
          throw Error("STATIC_HASH_COLLISION_DO_NOT_OVERWRITE");
      }
      let verified = false;
      for (let attempt = 0; attempt < 3 && !verified; attempt++) {
        try {
          const response = await fetch(`${imageCdnOrigin}/${input.Key}`, {
            redirect: "error",
            signal: AbortSignal.timeout(20000),
          });
          if (
            response.ok &&
            response.headers.get("content-type")?.startsWith("image/webp")
          ) {
            const actual = Buffer.from(await response.arrayBuffer());
            verified =
              createHash("sha256").update(actual).digest("hex") === sha;
          }
        } catch {
          /* A failed verification never enables a CDN URL. */
        }
      }
      if (!verified) throw Error(`STATIC_CDN_VERIFICATION_FAILED: ${path}`);
      published.push(path);
    }
    console.log("Published and verified:", src);
  }
  await writeFile(
    "lib/static-image-cdn-manifest.json",
    JSON.stringify(published.sort(), null, 2) + "\n",
  );
  console.log({ verifiedFiles: published.length });
}
void main();
