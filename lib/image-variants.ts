import sharp from "sharp";
import { imageWidths } from "./image-sizes";
export async function prepareImageVariants(original: Buffer) {
  return Promise.all(
    imageWidths.map(async (width) => ({
      width,
      data: await sharp(original, { limitInputPixels: 40000000 })
        .rotate()
        .resize({
          width,
          height: width,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: width <= 960 ? 78 : 84 })
        .toBuffer(),
    })),
  );
}
