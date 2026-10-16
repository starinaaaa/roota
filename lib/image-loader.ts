"use client";
import manifest from "./local-image-manifest.json";
import { preparedImageWidth, imageVariantVersion } from "./image-sizes";
import { cdnImageUrl } from "./image-cdn";

type LoaderInput = { src: string; width: number; quality?: number };

export function fallbackImageLoader({ src, width }: LoaderInput) {
  const size = preparedImageWidth(width);
  const local = (manifest as Record<string, string>)[src];
  if (local) return `${local}-${size}.webp`;
  if (/^\/(media|site-media)\//.test(src))
    return `${src}?w=${size}&v=${imageVariantVersion}`;
  return src;
}

export default function imageLoader(input: LoaderInput) {
  // Preserve local assets exactly, even if the manifests ever overlap.
  if ((manifest as Record<string, string>)[input.src])
    return fallbackImageLoader(input);
  return (
    cdnImageUrl(input.src, preparedImageWidth(input.width)) ??
    fallbackImageLoader(input)
  );
}
