import manifest from "./cdn-image-manifest.json";
import { imageVariantVersion } from "./image-sizes";

export const imageCdnOrigin = "https://bf6fiiksb2.cdn.twcstorage.ru";
const uuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const productRoute = new RegExp(`^/media/(${uuid})/(${uuid})$`);
const siteRoute = new RegExp(`^/site-media/(${uuid})$`);

export function imageCdnPath(src: string): string | undefined {
  const product = productRoute.exec(src);
  if (product) return `product-drafts/${product[1]}/${product[2]}.webp`;
  const site = siteRoute.exec(src);
  if (site) return `product-drafts/site/${site[1]}.webp`;
}

export function cdnImageUrl(src: string, width: number): string | undefined {
  const path = imageCdnPath(src);
  // Only verified bucket/path/size combinations bypass the compatibility routes.
  const widths = (manifest.images as Record<string, number[]>)[src];
  if (
    !path ||
    manifest.version !== imageVariantVersion ||
    !widths?.includes(width)
  )
    return;
  return `${imageCdnOrigin}/${path}.v${imageVariantVersion}.w${width}.webp`;
}
