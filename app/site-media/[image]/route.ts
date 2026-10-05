import { getSiteContent } from "@/lib/site";
import { createServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ image: string }> },
) {
  const { image } = await params;
  if (
    !uuid.safeParse(image).success ||
    (await getSiteContent()).heroImage !== `/site-media/${image}`
  )
    return new Response(null, { status: 404 });
  const { data, error } = await createServerClient()
    .storage.from("product-drafts")
    .download(`site/${image}.webp`);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": data.type,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
