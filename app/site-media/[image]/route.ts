import { imageWidths, imageVariantVersion } from "@/lib/image-sizes";
import { getSiteContent } from "@/lib/site";
import { createServerClient } from "@/lib/db";
import { uuid } from "@/lib/validation";
import { cachedSiteImage } from "@/lib/site-image-cache";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ image: string }> },
) {
  const { image } = await params;
  if (
    !uuid.safeParse(image).success ||
    (await getSiteContent()).heroImage !== `/site-media/${image}`
  )
    return new Response(null, { status: 404 });
  const width = Number(new URL(request.url).searchParams.get("w"));
  if (
    new URL(request.url).searchParams.has("w") &&
    !imageWidths.some((size) => size === width)
  )
    return new Response(null, { status: 400 });
  const version = new URL(request.url).searchParams.get("v");
  if (version !== null && version !== String(imageVariantVersion))
    return new Response(null, { status: 400 });
  const variantSuffix = version
    ? `.v${version}.w${width}.webp`
    : `.w${width}.webp`;
  const storage = createServerClient().storage.from("product-drafts");
  const path = `site/${image}.webp`;
  let data: Blob;
  try {
    data = await cachedSiteImage(
      width ? `${path}${variantSuffix}` : path,
      async () => {
        let downloaded = await storage.download(
          width ? `${path}${variantSuffix}` : path,
        );
        if (downloaded.error && width)
          downloaded = await storage.download(path);
        if (downloaded.error || !downloaded.data)
          throw new Error("SITE_IMAGE_UNAVAILABLE");
        return downloaded.data;
      },
    );
  } catch {
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "1" },
    });
  }
  return new Response(data, {
    headers: {
      "Content-Type": data.type,
      "Content-Length": String(data.size),
      "Cache-Control": "public, max-age=300",
      "Vercel-CDN-Cache-Control":
        "public, s-maxage=3600, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
