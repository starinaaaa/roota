import SubmitButton from "@/components/ui/SubmitButton";
import { relationList } from "@/lib/relation-list";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import { moderateReview } from "@/lib/actions/email-admin";
import { getPool } from "@/lib/db/pool";
import { confirmTelegramReview } from "@/lib/actions/review-rewards";
import { rewardExpiry } from "@/lib/review-copy";
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
  const telegramOrders = (
    await getPool().query<{
      id: string;
      order_number: string;
      customer_name: string;
      code: string | null;
      expires_at: Date | null;
      source: string | null;
    }>(`select o.id,o.order_number,o.customer_name,r.code,r.expires_at,r.source from orders o
    left join review_rewards r on r.source_order_id=o.id
    where o.payment_status='paid' and o.delivery_stage='delivered' and o.status::text<>'cancelled'
    order by o.updated_at desc limit 100`)
  ).rows;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-page">Отзывы</h1>
      <p>
        Публикуйте отзывы любой оценки, если покупатель разрешил публикацию.
        Контакты остаются в админке. Основная форма — на сайте по персональной ссылке из заказа. Приглашение отправляется на почту через 7 дней после получения всего заказа, если покупатель согласился на такое письмо.
      </p>
      <h2 className="text-xl">Отзывы с сайта</h2>
      {!reviews.data.length && <p>Пока нет отзывов с сайта.</p>}
      {reviews.data.map((r) => (
        <article key={r.id} className="admin-card space-y-3">
          <p>
            Заказ {r.orders?.order_number} · {r.rating}/5 · {r.state}
          </p>
          <p>Имя для публикации: {r.display_name || "Покупатель Roota"}</p>
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
            <SubmitButton className="admin-button">Сохранить</SubmitButton>
          </form>
        </article>
      ))}
      <section className="admin-card space-y-4">
        <h2 className="text-xl">Отзывы в Telegram и промокоды</h2>
        <p>
          После получения честного отзыва подтвердите его здесь. Покупатель
          получит персональный код на 10% на изделия на 30 дней. Оценка, фото и
          согласие на публикацию не влияют на выдачу.
        </p>
        {telegramOrders.length === 0 && <p>Пока нет полученных заказов.</p>}
        {telegramOrders.map((o) => (
          <div key={o.id} className="border-t border-stone-200 pt-4 space-y-2">
            <p>
              Заказ {o.order_number} · {o.customer_name}
            </p>
            {o.code ? (
              <p>
                Код выдан за отзыв{" "}
                {o.source === "telegram" ? "в Telegram" : "на сайте"}:{" "}
                <span className="font-mono select-all">{o.code}</span> · до{" "}
                {rewardExpiry(o.expires_at!)}
              </p>
            ) : (
              <form action={confirmTelegramReview} className="space-y-3">
                <input type="hidden" name="order_id" value={o.id} />
                <label className="flex gap-2">
                  <input type="checkbox" name="confirmed" required />
                  Получен отзыв об этом заказе в Telegram
                </label>
                <SubmitButton className="admin-button">
                  Подтвердить отзыв и выдать промокод
                </SubmitButton>
              </form>
            )}
          </div>
        ))}
      </section>
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
