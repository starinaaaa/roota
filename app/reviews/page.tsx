import { createServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export const metadata = { title: "Отзывы — Roota" };
export default async function ReviewsPage() {
  const { data, error } = await createServerClient()
    .from("customer_reviews")
    .select("id,rating,body,photo_paths,created_at")
    .eq("state", "published")
    .eq("publication_consent", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Не удалось загрузить отзывы");
  return (
    <div className="max-w-3xl mx-auto px-6 pt-32 pb-16 space-y-8">
      <h1 className="font-display text-page">Отзывы</h1>
      {!data.length && <p>Здесь скоро появятся отзывы покупателей.</p>}
      {data.map((r) => (
        <article
          key={r.id}
          className="border-b border-stone-200 pb-6 space-y-3"
        >
          <p>
            {r.rating} из 5 ·{" "}
            {new Date(r.created_at).toLocaleDateString("ru-RU")}
          </p>
          <p className="whitespace-pre-wrap">{r.body}</p>
          <div className="flex gap-3">
            {r.photo_paths.map((_: string, i: number) => (
              <a
                href={`/review-media/${r.id}/${i}`}
                key={i}
                className="underline"
              >
                Фото {i + 1}
              </a>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
