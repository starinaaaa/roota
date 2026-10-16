import { imageWidths, imageVariantVersion } from "@/lib/image-sizes";
import { createServerClient } from "@/lib/db";
import { uuid } from "@/lib/validation";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ product: string; image: string }> },
) {
  const { product, image } = await params;
  if (!uuid.safeParse(product).success || !uuid.safeParse(image).success)
    return new Response(null, { status: 404 });
  const publicDb = createServerClient();
  const { data: published, error: publicationError } = await publicDb.from("products").select("id").eq("id",product).eq("publication_status","published").eq("is_active",true).maybeSingle();
  if (publicationError || !published) return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
  const { data, error } = await publicDb
    .from("product_images")
    .select("bucket,storage_path")
    .eq("id", image)
    .eq("product_id", product)
    .maybeSingle();
  if (error || !data) return new Response(null, { status: 404 });
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
  const storage = createServerClient().storage.from(data.bucket);
  let downloaded = await storage.download(
    width ? `${data.storage_path}${variantSuffix}` : data.storage_path,
  );
  if (downloaded.error && width)
    downloaded = await storage.download(data.storage_path);
  const { data: file, error: storageError } = downloaded;
  if (storageError || !file) return new Response(null, { status: 404 });
  return new Response(file, {
    headers: {
      "Content-Type": file.type,
      "Cache-Control":
        "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
      "Vercel-CDN-Cache-Control":
        "public, s-maxage=3600, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
