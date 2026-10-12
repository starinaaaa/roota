import { imageWidths } from "@/lib/image-sizes";
import { getSiteContent } from "@/lib/site";
import { createServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
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
  const storage = createServerClient().storage.from("product-drafts");
  const path = `site/${image}.webp`;
  let downloaded = await storage.download(
    width ? `${path}.w${width}.webp` : path,
  );
  if (downloaded.error && width) downloaded = await storage.download(path);
  const { data, error } = downloaded;
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": data.type,
      "Cache-Control": "public, max-age=300",
      "Vercel-CDN-Cache-Control":
        "public, s-maxage=3600, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
