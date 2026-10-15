import { createServerClient } from "@/lib/db";
import { getAdmin } from "@/lib/auth";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const { id, index } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^\d$/.test(index))
    return new Response(null, { status: 404 });
  const db = createServerClient();
  const { data: r } = await db
    .from("customer_reviews")
    .select("photo_paths,state,publication_consent")
    .eq("id", id)
    .maybeSingle();
  const published = r?.state === "published" && r.publication_consent;
  if (
    !r ||
    (!published && !(await getAdmin())) ||
    !r.photo_paths[Number(index)]
  )
    return new Response(null, { status: 404 });
  const { data, error } = await db.storage
    .from("review-photos")
    .download(r.photo_paths[Number(index)]);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": published ? "public,max-age=60" : "private,no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
