"use client";
import manifest from "./local-image-manifest.json";
import { preparedImageWidth, imageVariantVersion } from "./image-sizes";
export default function imageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  const size = preparedImageWidth(width);
  const local = (manifest as Record<string, string>)[src];
  if (local) return `${local}-${size}.webp`;
  if (/^\/(media|site-media)\//.test(src))
    return `${src}?w=${size}&v=${imageVariantVersion}`;
  return src;
}
