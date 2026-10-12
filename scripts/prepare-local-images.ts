import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { aboutGallery } from "../lib/about-gallery";
import { imageVariantVersion } from "../lib/image-sizes";
import { prepareImageVariants } from "../lib/image-variants";
async function main() {
  const sources = [
    ...new Set([
      ...aboutGallery.map((photo) => photo.src),
      "/images/about/hero-plates.jpg",
      "/images/hero-bg.jpg",
    ]),
  ];
  const manifest: Record<string, string> = {};
  await mkdir("public/optimized", { recursive: true });
  for (const src of sources) {
    const original = await readFile(`public${src}`),
      hash = createHash("sha256")
        .update(String(imageVariantVersion))
        .update(original)
        .digest("hex")
        .slice(0, 16);
    const base = `/optimized/${hash}`;
    for (const { width, data } of await prepareImageVariants(original))
      await writeFile(`public${base}-${width}.webp`, data);
    manifest[src] = base;
  }
  await writeFile(
    "lib/local-image-manifest.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log("Prepared local images:", sources.length);
}
void main();
