import SubmitButton from "@/components/ui/SubmitButton";
import { confirmTelegramReview } from "@/lib/actions/review-rewards";
import { getPool } from "@/lib/db/pool";
import { rewardExpiry } from "@/lib/review-copy";

export default async function ReviewRewardCard({
  orderId,
  available,
}: {
  orderId: string;
  available: boolean;
}) {
  if (!available) return null;
  const reward = (
    await getPool().query<{
      code: string;
      expires_at: Date;
      source: string;
      redeemed_at: Date | null;
      revoked_at: Date | null;
      expired: boolean;
    }>(
      "select code,expires_at,source,redeemed_at,revoked_at,expires_at<=now() expired from review_rewards where source_order_id=$1",
      [orderId],
    )
  ).rows[0];
  return (
    <section className="admin-card space-y-3">
      <h2 className="text-lg">Отзыв и персональный промокод</h2>
      {reward ? (
        <>
          <p>
            Выдан за отзыв{" "}
            {reward.source === "telegram" ? "в Telegram" : "на сайте"}:{" "}
            <span className="font-mono select-all">{reward.code}</span>
          </p>
          <p>
            {reward.redeemed_at
              ? "Использован"
              : reward.revoked_at
                ? "Отменён"
                : reward.expired
                  ? "Срок завершён"
                  : `10% на изделия до ${rewardExpiry(reward.expires_at)}`}
          </p>
        </>
      ) : (
        <>
          <p>
            За отзыв на сайте код выдаётся автоматически. Если получили отзыв в
            Telegram, подтвердите его здесь — покупателю придёт код на 10% на
            изделия, привязанный к телефону этого заказа, на 30 дней.
          </p>
          <form action={confirmTelegramReview} className="space-y-3">
            <input type="hidden" name="order_id" value={orderId} />
            <label className="flex gap-2">
              <input type="checkbox" name="confirmed" required />
              Получен отзыв об этом заказе в Telegram
            </label>
            <SubmitButton className="admin-button">
              Подтвердить отзыв и выдать промокод
            </SubmitButton>
          </form>
        </>
      )}
    </section>
  );
}
