import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ product: string; image: string }> },
) {
  const { product, image } = await params;
  if (!uuid.safeParse(product).success || !uuid.safeParse(image).success)
    return new Response(null, { status: 404 });
  const publicDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await publicDb
    .from("product_images")
    .select("bucket,storage_path")
    .eq("id", image)
    .eq("product_id", product)
    .maybeSingle();
  if (error || !data) return new Response(null, { status: 404 });
  const { data: file, error: storageError } = await createServerClient()
    .storage.from(data.bucket)
    .download(data.storage_path);
  if (storageError || !file) return new Response(null, { status: 404 });
  return new Response(file, {
    headers: {
      "Content-Type": file.type,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
