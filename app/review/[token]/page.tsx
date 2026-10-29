import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/db";
import { orderIdForToken } from "@/lib/order-access";
import { submitReview } from "@/lib/actions/reviews";
import { getPool } from "@/lib/db/pool";
import { getSiteContent } from "@/lib/site";
import {
  reviewCopy,
  REVIEW_REWARD_TERMS,
  reviewTelegramUrl,
  rewardExpiry,
} from "@/lib/review-copy";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Отзыв о заказе — Roota",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const id = await orderIdForToken(token);
  if (!id) notFound();
  const db = createServerClient();
  const [order, review] = await Promise.all([
    db
      .from("orders")
      .select(
        "order_number,delivery_stage,payment_status,status,order_items(product_name,quantity,configuration)",
      )
      .eq("id", id)
      .single(),
    db.from("customer_reviews").select("id").eq("order_id", id).maybeSingle(),
  ]);
  if (
    !order.data ||
    order.data.delivery_stage !== "delivered" ||
    order.data.payment_status !== "paid" ||
    order.data.status === "cancelled"
  )
    notFound();
  const [site, rewardResult] = await Promise.all([
    getSiteContent(),
    getPool().query<{
      code: string;
      expires_at: Date;
      redeemed_at: Date | null;
      reserved_order_id: string | null;
      revoked_at: Date | null;
      expired: boolean;
    }>(
      "select code,expires_at,redeemed_at,reserved_order_id,revoked_at,expires_at<=now() as expired from review_rewards where source_order_id=$1",
      [id],
    ),
  ]);
  const reward = rewardResult.rows[0];
  const copy = reviewCopy(order.data.order_items);
  return (
    <div className="max-w-xl mx-auto px-6 pt-32 pb-16 space-y-6">
      <h1 className="font-display text-page">{copy.subject}</h1>
      <p>
        Заказ {order.data.order_number}. Будем рады честному отзыву — любая
        оценка важна.
      </p>
      <p>{copy.introduction}</p>
      {review.data || reward ? (
        <div className="space-y-4" role="status">
          <p>Спасибо, отзыв передан студии!</p>
          {reward &&
            (reward.revoked_at || reward.redeemed_at || reward.expired ? (
              <p>
                {reward.redeemed_at
                  ? "Ваш промокод уже использован."
                  : "Срок действия промокода завершён."}
              </p>
            ) : (
              <div className="border border-stone-300 p-5 space-y-3">
                <p>Ваш персональный промокод на скидку 10%</p>
                <p className="font-mono text-xl select-all break-all">
                  {reward.code}
                </p>
                <p>
                  Действует до {rewardExpiry(reward.expires_at)} на изделия в
                  следующем заказе. Укажите тот же телефон, что в этом заказе.
                  Доставка оплачивается полностью.
                </p>
                <p className="text-caption">
                  Одно применение, без суммирования с другими промокодами. Код
                  также отправим на вашу почту.
                </p>
                {reward.reserved_order_id && (
                  <p>Код уже применён к оформленному заказу.</p>
                )}
                <a href="/catalog" className="underline">
                  Выбрать изделия
                </a>
              </div>
            ))}
        </div>
      ) : (
        <>
          <p className="text-ui">{REVIEW_REWARD_TERMS}</p>
          <a
            href={reviewTelegramUrl(site.telegram, order.data.order_number)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block border border-stone-300 px-4 py-3 underline"
          >
            Написать отзыв в Telegram
          </a>
          <p className="text-caption">
            За отзыв в Telegram пришлём код после подтверждения студией. На
            сайте код появится сразу после отправки.
          </p>
          <form action={submitReview} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <label className="block">
              Оценка
              <select name="rating" className="admin-input" defaultValue="5">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} из 5
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Ваш отзыв
              <textarea
                name="body"
                className="admin-input"
                rows={6}
                maxLength={4000}
                required
              />
            </label>
            <label className="block">
              Фото по желанию: до 3 фотографий, по 3 МБ
              <input
                type="file"
                name="photos"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="admin-input"
              />
            </label>
            <label className="flex gap-2">
              <input type="checkbox" name="publication_consent" />
              Разрешаю публикацию текста, оценки и фотографий на сайте Roota.
              Контакты и номер заказа не публикуются.
            </label>
            <p className="text-caption">
              Без этого согласия отзыв останется доступен только студии.{" "}
              <a href="/privacy" className="underline">
                Политика конфиденциальности
              </a>
            </p>
            <button className="admin-button">Отправить отзыв</button>
          </form>
        </>
      )}
    </div>
  );
}
