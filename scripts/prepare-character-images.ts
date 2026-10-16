import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Existing maximum CSS boxes × DPR 3. Keep object-contain and all page CSS intact.
const boxes = {
  skater: [176, 224],
  resting: [256, 192],
  flower: [256, 256],
  walker: [96, 160],
  watering: [176, 160],
} as const;
async function main() {
  const manifest: Record<string, string> = {};
  await mkdir("public/optimized", { recursive: true });
  for (const [name, [width, height]] of Object.entries(boxes)) {
    const original = await readFile(`public/images/characters/${name}.png`);
    const image = await sharp(original)
      .resize({
        width: width * 3,
        height: height * 3,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
    const hash = createHash("sha256").update(image).digest("hex").slice(0, 16);
    const url = `/optimized/character-${hash}.webp`;
    await writeFile(`public${url}`, image);
    manifest[name] = url;
    console.log({ name, originalBytes: original.length, bytes: image.length });
  }
  await writeFile(
    "lib/character-image-manifest.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
void main();
