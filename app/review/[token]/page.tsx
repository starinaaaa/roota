import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { orderIdForToken } from "@/lib/order-access";
import { submitReview } from "@/lib/actions/reviews";
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
      .select("order_number,delivery_stage,payment_status,status")
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
  return (
    <div className="max-w-xl mx-auto px-6 pt-32 pb-16 space-y-6">
      <h1 className="font-display text-page">Как вам ваша тарелочка?</h1>
      <p>
        Заказ {order.data.order_number}. Будем рады честному отзыву — любая
        оценка важна.
      </p>
      {review.data ? (
        <p role="status">Спасибо, отзыв сохранён и передан студии.</p>
      ) : (
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
            До 3 фотографий, по 3 МБ
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
      )}
    </div>
  );
}
