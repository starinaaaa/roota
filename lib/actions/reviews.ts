"use server";
import { z } from "zod";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { orderIdForToken } from "@/lib/order-access";
export async function submitReview(form: FormData) {
  const token = String(form.get("token") ?? "");
  const orderId = await orderIdForToken(token);
  if (!orderId) throw new Error("Неверная ссылка");
  const rating = z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .parse(form.get("rating"));
  const body = z.string().trim().min(1).max(4000).parse(form.get("body"));
  const consent = form.get("publication_consent") === "on";
  const photos = form
    .getAll("photos")
    .filter((p): p is File => p instanceof File && p.size > 0);
  if (
    photos.length > 3 ||
    photos.some(
      (p) =>
        p.size > 3 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(p.type),
    )
  )
    throw new Error("До 3 фотографий JPEG, PNG или WebP, по 3 МБ");
  const db = createServerClient();
  const { data: existing } = await db
    .from("customer_reviews")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing) redirect(`/review/${token}?saved=1`);
  const paths: string[] = [];
  try {
    for (const photo of photos) {
      const buffer = await sharp(Buffer.from(await photo.arrayBuffer()), {
        limitInputPixels: 25000000,
      })
        .rotate()
        .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const path = `${orderId}/${randomUUID()}.jpg`;
      const { error } = await db.storage
        .from("review-photos")
        .upload(path, buffer, { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error("Не удалось сохранить фото");
      paths.push(path);
    }
    const { error } = await db.rpc("submit_customer_review", {
      p_token: token,
      p_rating: rating,
      p_body: body,
      p_photos: paths,
      p_consent: consent,
    });
    if (error) throw new Error("Отзыв доступен только по полученному заказу");
  } catch (error) {
    if (paths.length) await db.storage.from("review-photos").remove(paths);
    throw error;
  }
  redirect(`/review/${token}?saved=1`);
}
