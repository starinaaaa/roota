"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { imageCdnOrigin } from "@/lib/image-cdn";
import { fallbackImageLoader } from "@/lib/image-loader";

/** Retry a failed CDN request through the existing, validated media route. */
export default function StoreImage({
  src,
  alt,
  onError,
  loader,
  ...props
}: ImageProps) {
  const [failedSource, setFailedSource] = useState<ImageProps["src"] | null>(
    null,
  );
  const fallback = failedSource === src;
  return (
    <Image
      {...props}
      src={src}
      alt={alt}
      loader={fallback ? fallbackImageLoader : loader}
      onError={(event) => {
        if (
          !fallback &&
          event.currentTarget.currentSrc.startsWith(`${imageCdnOrigin}/`)
        ) {
          setFailedSource(src);
          return;
        }
        onError?.(event);
      }}
    />
  );
}
