import sharp from "sharp";
import { imageWidths } from "./image-sizes";
export async function prepareImageVariants(original: Buffer) {
  const variants: { width: number; data: Buffer }[] = [];
  // Limit simultaneous decodes so large camera photos do not exhaust upload memory.
  for (let offset = 0; offset < imageWidths.length; offset += 2) {
    variants.push(
      ...(await Promise.all(
        imageWidths.slice(offset, offset + 2).map(async (width) => ({
          width,
          data: await sharp(original, { limitInputPixels: 40000000 })
            .rotate()
            .resize({
              width,
              withoutEnlargement: true,
            })
            .webp({ quality: width <= 960 ? 78 : 84 })
            .toBuffer(),
        })),
      )),
    );
  }
  return variants;
}
