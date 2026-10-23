import sharp from "sharp";

export const browserIconVersion = 2;
export const browserIconSizes = [16, 32, 192] as const;
export type BrowserIconSize = (typeof browserIconSizes)[number];

export function browserIconUrl(source: string, size: BrowserIconSize) {
  return `${source}?format=png&iconSize=${size}&iconVersion=${browserIconVersion}`;
}

// Prepare the uploaded artwork for actual tab sizes without changing the source.
export async function renderBrowserIcon(source: Buffer, size: BrowserIconSize) {
  if (!browserIconSizes.includes(size)) throw new Error("INVALID_ICON_SIZE");
  const padding = size === 192 ? 8 : size === 32 ? 2 : 1;
  const inner = size - padding * 2;
  const cropped = await sharp(source)
    .autoOrient()
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 20, lineArt: true })
    .png()
    .toBuffer();
  let prepared = await sharp(cropped)
    .resize(inner * 4, inner * 4, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
  // Reinforce monochrome line drawings at 16/32px; keep coloured logos intact.
  const pixels = await sharp(prepared).removeAlpha().raw().toBuffer();
  let monochrome = true;
  for (let i = 0; i < pixels.length; i += 3) {
    if (
      Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) -
        Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) >
      16
    ) {
      monochrome = false;
      break;
    }
  }
  if (monochrome && size <= 32) {
    prepared = await sharp(prepared)
      .linear(1.4, -102)
      .dilate(1)
      .png()
      .toBuffer();
  }
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.max(2, Math.round(size * 0.15))}" fill="white"/></svg>`,
  );
  return sharp(prepared)
    .resize(inner, inner, { fit: "contain", background: "#ffffff" })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: "#ffffff",
    })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}
