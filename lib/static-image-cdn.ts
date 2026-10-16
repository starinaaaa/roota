import files from "./static-image-cdn-manifest.json";
import { imageCdnOrigin } from "./image-cdn";
const published = new Set<string>(files);

// Only prepared, hashed local files that were uploaded and verified are eligible.
export function staticImageCdnUrl(path: string) {
  if (
    !/^\/optimized\/[a-f0-9]{16}-\d+\.webp$/.test(path) ||
    !published.has(path)
  )
    return;
  return `${imageCdnOrigin}/site-static${path}`;
}
