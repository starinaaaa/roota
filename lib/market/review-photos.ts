import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { isTrustedRequestOrigin } from "../request-origin";
import {
  REVIEW_PHOTO_LIMIT,
  REVIEW_PHOTO_MAX_BYTES,
  reviewPhotoError,
} from "../reviews";
import {
  marketReviewSchema,
  marketReviewState,
  submitMarketReview,
} from "./reviews";
import type { MarketDb } from "./store";

const MAX_REQUEST_BYTES =
  REVIEW_PHOTO_LIMIT * REVIEW_PHOTO_MAX_BYTES + 64 * 1024;
export async function readMarketReviewMultipart(request: Request) {
  if (
    !isTrustedRequestOrigin(request) ||
    !request.headers.get("content-type")?.startsWith("multipart/form-data;")
  )
    throw new Error("Недопустимый запрос");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Пустой запрос");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error(
        "Слишком большой запрос. Добавьте до 5 фото размером до 3 МБ каждое.",
      );
    }
    chunks.push(value);
  }
  const bounded = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: new Uint8Array(Buffer.concat(chunks)),
  });
  const form = await bounded.formData();
  const photos = form
    .getAll("photos")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const error = reviewPhotoError(photos);
  if (error) throw new Error(error);
  return {
    photos,
    body: {
      displayName: form.get("displayName"),
      phone: form.get("phone"),
      rating: form.get("rating"),
      body: form.get("body"),
      publicationConsent: form.get("publicationConsent") === "true",
      accepted: form.get("accepted") === "true",
    },
  };
}

type PhotoStore = {
  upload: (
    path: string,
    body: Buffer,
    options: { contentType: string; upsert: boolean },
  ) => Promise<{ error: unknown }>;
  remove: (paths: string[]) => Promise<unknown>;
};
type PhotoDependencies = {
  db: MarketDb;
  transaction: <T>(work: (db: MarketDb) => Promise<T>) => Promise<T>;
  store: PhotoStore;
};

/** Decode and strip metadata before anything is uploaded. Originals stay on the buyer's device. */
export async function prepareMarketReviewPhotos(photos: File[]) {
  const error = reviewPhotoError(photos);
  if (error) throw new Error(error);
  const images: Buffer[] = [];
  for (const photo of photos) {
    try {
      const image = sharp(Buffer.from(await photo.arrayBuffer()), {
        limitInputPixels: 25000000,
      });
      const metadata = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? ""))
        throw new Error("INVALID_FORMAT");
      images.push(
        await image
          .rotate()
          .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer(),
      );
    } catch {
      throw new Error(
        "Не удалось прочитать одно из фото. Выберите фото JPEG, PNG или WebP и попробуйте ещё раз.",
      );
    }
  }
  return images;
}

export async function saveMarketReviewPhotos(
  token: string,
  raw: unknown,
  photos: File[],
  deps: PhotoDependencies,
) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("Проверьте персональную ссылку из письма");
  const input = marketReviewSchema.parse(raw);
  const current = await marketReviewState(deps.db, token);
  if (!current)
    throw new Error("Отзыв доступен по персональной ссылке после покупки");
  if (current.saved) return current;
  const {
    rows: [sale],
  } = await deps.db.query<{ id: string }>(
    "select id from public.market_sales where review_token=$1 and mode='live' and status='paid'",
    [token],
  );
  if (!sale)
    throw new Error("Отзыв доступен по персональной ссылке после покупки");
  const images = await prepareMarketReviewPhotos(photos);
  const paths: string[] = [];
  let persistenceStarted = false;
  const remove = async (unused: string[]) => {
    if (unused.length) {
      try {
        await deps.store.remove(unused);
      } catch {
        console.error("market_review_photo_cleanup_failed");
      }
    }
  };
  try {
    for (const image of images) {
      const path = `market/${sale.id}/${randomUUID()}.jpg`;
      const { error } = await deps.store.upload(path, image, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (error)
        throw new Error(
          "Не удалось загрузить фотографии. Ваш текст и фото остались в форме, повторите отправку.",
        );
      paths.push(path);
    }
    // A lost COMMIT response must never delete images used by an already saved review.
    persistenceStarted = true;
    const result = await deps.transaction(async (db) => {
      // Same row lock as submit_market_review: concurrent submissions cannot replace the first review's photos.
      await db.query(
        "select id from public.market_sales where id=$1 for update",
        [sale.id],
      );
      const previous = await marketReviewState(db, token);
      const state = await submitMarketReview(db, token, input);
      if (!previous?.saved && paths.length) {
        await db.query(
          "update public.customer_reviews set photo_paths=$2::text[] where market_sale_id=$1",
          [sale.id, paths],
        );
      }
      const {
        rows: [review],
      } = await db.query<{ photo_paths: string[] }>(
        "select photo_paths from public.customer_reviews where market_sale_id=$1",
        [sale.id],
      );
      return { state, used: review?.photo_paths ?? [] };
    });
    await remove(paths.filter((path) => !result.used.includes(path)));
    return result.state;
  } catch (error) {
    if (!persistenceStarted) await remove(paths);
    throw error;
  }
}
