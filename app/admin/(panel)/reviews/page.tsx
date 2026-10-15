import { relationList } from "@/lib/relation-list";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import { moderateReview } from "@/lib/actions/email-admin";
export const dynamic = "force-dynamic";
export default async function ReviewsAdmin() {
  await requireAdmin();
  const db = createServerClient();
  const [reviews, invites] = await Promise.all([
    db
      .from("customer_reviews")
      .select("*,orders(order_number)")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("email_messages")
      .select("id,recipient,state,scheduled_at,orders(order_number)")
      .eq("kind", "review_invite")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (reviews.error || invites.error)
    throw new Error("Не удалось загрузить отзывы");
  return (
    <div className="space-y-6">
      <h1 className="font-display text-page">Отзывы</h1>
      <p>
        Публикуйте отзывы любой оценки, если покупатель разрешил публикацию.
        Контакты остаются в админке.
      </p>
      {reviews.data.map((r) => (
        <article key={r.id} className="admin-card space-y-3">
          <p>
            Заказ {r.orders?.order_number} · {r.rating}/5 · {r.state}
          </p>
          <p className="whitespace-pre-wrap">{r.body}</p>
          <p>
            {r.publication_consent
              ? "Публикация разрешена"
              : "Только для студии"}
          </p>
          <div className="flex gap-2">
            {r.photo_paths.map((_: string, i: number) => (
              <a
                key={i}
                href={`/review-media/${r.id}/${i}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Фото {i + 1}
              </a>
            ))}
          </div>
          <form action={moderateReview} className="flex gap-3">
            <input type="hidden" name="id" value={r.id} />
            <select name="state" defaultValue={r.state} className="admin-input">
              <option value="pending">На проверке</option>
              <option value="published" disabled={!r.publication_consent}>
                Опубликовать
              </option>
              <option value="hidden">Скрыть</option>
            </select>
            <button className="admin-button">Сохранить</button>
          </form>
        </article>
      ))}
      <h2 className="text-xl">Приглашения</h2>
      {invites.data.map((i) => (
        <p key={i.id}>
          Заказ {relationList(i.orders)[0]?.order_number} · {i.recipient} ·{" "}
          {i.state} ·{" "}
          {new Date(i.scheduled_at).toLocaleString("ru-RU", {
            timeZone: "Europe/Moscow",
          })}
        </p>
      ))}
    </div>
  );
}
