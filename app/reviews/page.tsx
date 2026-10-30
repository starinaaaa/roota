import Image from "next/image";
import { createServerClient } from "@/lib/db";
export const dynamic = "force-dynamic";
export const metadata = { title: "Отзывы — Roota" };
export default async function ReviewsPage() {
  const { data, error } = await createServerClient()
    .from("customer_reviews")
    .select("id,display_name,rating,body,photo_paths,created_at")
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
          <p className="font-medium">{r.display_name || "Покупатель Roota"}</p>
          <p>
            {r.rating} из 5 ·{" "}
            {new Date(r.created_at).toLocaleDateString("ru-RU")}
          </p>
          <p className="whitespace-pre-wrap">{r.body}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {r.photo_paths.map((_: string, i: number) => (
              <a
                href={`/review-media/${r.id}/${i}`}
                key={i}
                target="_blank"
                rel="noreferrer"
                aria-label={`Открыть фото ${i + 1} из отзыва`}
                className="block focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                <Image
                  src={`/review-media/${r.id}/${i}`}
                  alt={`Фото изделия от покупателя, ${i + 1}`}
                  width={400}
                  height={400}
                  unoptimized
                  className="aspect-square w-full object-cover"
                />
              </a>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
