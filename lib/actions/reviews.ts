"use server";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/db";
import { getPool, transaction } from "@/lib/db/pool";
import { orderIdForToken } from "@/lib/order-access";
import { after } from "next/server";
import { processEmailQueue } from "@/lib/email/queue";
import { canReviewOrder, reviewPhotoError, reviewSchema } from "@/lib/reviews";

export type ReviewFormState = { error?: string };

export async function submitReview(
  _previous: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const token = String(form.get("token") ?? "");
  const parsed = reviewSchema.safeParse({
    rating: form.get("rating"),
    body: form.get("body"),
    displayName: form.get("display_name"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const photos = form
    .getAll("photos")
    .filter((photo): photo is File => photo instanceof File && photo.size > 0);
  const photoError = reviewPhotoError(photos);
  if (photoError) return { error: photoError };
  const consent = form.get("publication_consent") === "on";
  const paths: string[] = [];
  let persistenceStarted = false;
  const db = createServerClient();
  try {
    const orderId = await orderIdForToken(token);
    if (!orderId)
      return {
        error:
          "Проверьте персональную ссылку на отзыв из письма или со страницы заказа.",
      };
    const order = (
      await getPool().query(
        "select delivery_stage,payment_status,status from orders where id=$1",
        [orderId],
      )
    ).rows[0];
    if (!order || !canReviewOrder(order))
      return {
        error: "Оставить отзыв можно после получения всего оплаченного заказа.",
      };
    const existing = await getPool().query(
      "select id from customer_reviews where order_id=$1",
      [orderId],
    );
    if (!existing.rows.length) {
      for (const photo of photos) {
        let buffer: Buffer;
        try {
          buffer = await sharp(Buffer.from(await photo.arrayBuffer()), {
            limitInputPixels: 25000000,
          })
            .rotate()
            .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        } catch {
          if (paths.length)
            await db.storage.from("review-photos").remove(paths);
          return {
            error:
              "Не удалось прочитать одно из фото. Выберите другое фото JPEG, PNG или WebP и отправьте отзыв ещё раз.",
          };
        }
        const path = `${orderId}/${randomUUID()}.jpg`;
        const { error } = await db.storage
          .from("review-photos")
          .upload(path, buffer, { contentType: "image/jpeg", upsert: false });
        if (error) throw new Error("PHOTO_UPLOAD_FAILED");
        paths.push(path);
      }
      // Keep uploaded objects if the database connection is lost at commit: a retry
      // must never delete photographs referenced by an already saved review.
      persistenceStarted = true;
      const usedPaths = await transaction(async (client) => {
        const saved = await client.query<{ id: string }>(
          "select public.submit_customer_review($1::text,$2::integer,$3::text,$4::text[],$5::boolean,$6::text) as id",
          [
            token,
            parsed.data.rating,
            parsed.data.body,
            paths,
            consent,
            parsed.data.displayName,
          ],
        );
        return (
          await client.query<{ photo_paths: string[] }>(
            "select photo_paths from customer_reviews where id=$1",
            [saved.rows[0].id],
          )
        ).rows[0].photo_paths;
      });
      // A concurrent submission may have saved the review first; keep its photos.
      const unused = paths.filter((path) => !usedPaths.includes(path));
      if (unused.length) await db.storage.from("review-photos").remove(unused);
    }
  } catch {
    if (!persistenceStarted && paths.length)
      await db.storage.from("review-photos").remove(paths);
    return {
      error:
        "Не удалось сохранить отзыв. Ваш текст и выбранные фото остались в форме. Повторите отправку; если отзыв уже сохранился, откроется подтверждение.",
    };
  }
  revalidatePath("/admin/reviews");
  revalidatePath(`/order/${token}`);
  after(async () => {
    try {
      await processEmailQueue();
    } catch {
      console.error("review_reward_queue_failed");
    }
  });
  redirect(`/review/${token}?saved=1`);
}
