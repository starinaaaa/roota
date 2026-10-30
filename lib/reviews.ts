import { z } from "zod";

export const REVIEW_PHOTO_LIMIT = 5;
export const REVIEW_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const REVIEW_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const REVIEW_PHOTO_HELP =
  "До 5 фото JPEG, PNG или WebP, до 3 МБ каждое.";

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Выберите оценку").max(5),
  body: z
    .string()
    .trim()
    .min(1, "Напишите несколько слов об изделии")
    .max(4000),
  displayName: z
    .string()
    .trim()
    .min(1, "Укажите имя для публикации")
    .max(80, "Имя — до 80 символов"),
});

export function reviewPhotoError(photos: { size: number; type: string }[]) {
  if (photos.length > REVIEW_PHOTO_LIMIT)
    return "Можно добавить не больше 5 фотографий.";
  if (photos.some((photo) => !REVIEW_PHOTO_TYPES.includes(photo.type)))
    return "Выберите фото JPEG, PNG или WebP. Фото HEIC сначала сохраните в JPEG.";
  if (photos.some((photo) => photo.size > REVIEW_PHOTO_MAX_BYTES))
    return "Одно из фото больше 3 МБ. Уменьшите его или выберите другое.";
  return null;
}

export function canReviewOrder(order: {
  delivery_stage: string | null;
  payment_status: string;
  status: string;
}) {
  return (
    order.delivery_stage === "delivered" &&
    order.payment_status === "paid" &&
    order.status !== "cancelled"
  );
}
