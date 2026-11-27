import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/db";
import { orderIdForToken } from "@/lib/order-access";
import Link from "next/link";
import ReviewForm from "@/components/review/ReviewForm";
import ReviewIntro from "@/components/review/ReviewIntro";
import { canReviewOrder } from "@/lib/reviews";
import { getPool } from "@/lib/db/pool";
import { getSiteContent } from "@/lib/site";
import {
  reviewCopy,
  reviewPageArtwork,
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
        "order_number,customer_name,delivery_stage,payment_status,status,order_items(product_name,quantity,configuration)",
      )
      .eq("id", id)
      .single(),
    db
      .from("customer_reviews")
      .select("id,publication_consent")
      .eq("order_id", id)
      .maybeSingle(),
  ]);
  if (order.error || review.error)
    throw new Error(
      "Не удалось загрузить отзыв. Попробуйте обновить страницу.",
    );
  if (!order.data || !canReviewOrder(order.data)) notFound();
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
  const submitted = Boolean(review.data || reward);
  return (
    <div className="mx-auto max-w-[600px] space-y-6 px-6 pt-28 pb-20 md:pt-36">
      <Link
        href={`/order/${token}`}
        className="text-caption text-stone-600 underline underline-offset-4"
      >
        ← К заказу
      </Link>
      <ReviewIntro
        title={submitted ? "Спасибо, что рассказали 💛" : copy.subject}
        introduction={submitted ? undefined : copy.introduction}
        artwork={submitted ? reviewPageArtwork.orderThanks : copy.pageArtwork}
      />
      {submitted ? (
        <div className="space-y-4" role="status">
          <p>
            {review.data
              ? review.data.publication_consent
                ? "Отзыв передан студии. Текст и фотографии появятся на сайте после проверки."
                : "Отзыв и фотографии доступны только студии и не будут опубликованы."
              : "Отзыв передан студии."}
          </p>
          {reward &&
            (reward.revoked_at || reward.redeemed_at || reward.expired ? (
              <p>
                {reward.redeemed_at
                  ? "Ваш промокод уже использован."
                  : "Срок действия промокода завершён."}
              </p>
            ) : (
              <div className="space-y-3 border-y border-stone-200 py-5">
                <p>Ваш персональный промокод на скидку 10%</p>
                <p className="inline-block bg-stone-100 px-4 py-2 font-mono text-xl break-all select-all">
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
          <details className="border-y border-stone-200 py-4 text-ui">
            <summary className="cursor-pointer">
              В благодарность — 10% на следующий заказ
            </summary>
            <p className="mt-3 text-caption text-stone-600">
              {REVIEW_REWARD_TERMS}
            </p>
          </details>
          <ReviewForm
            token={token}
            defaultName={order.data.customer_name.trim().split(/\s+/)[0] ?? ""}
          />
          <p className="border-t border-stone-200 pt-5 text-caption text-stone-600">
            <a
              href={reviewTelegramUrl(site.telegram, order.data.order_number)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Напишите отзыв в Telegram
            </a>{" "}
            и приложите фото в чат. Промокод пришлём после подтверждения
            студией.
          </p>
        </>
      )}
    </div>
  );
}
