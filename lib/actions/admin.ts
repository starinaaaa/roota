"use server";
import { imageVariantVersion } from "@/lib/image-sizes";
import { prepareImageVariants } from "@/lib/image-variants";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import { orderChangeSchema, productSchema, uuid } from "@/lib/validation";
import { revalidateTag, revalidatePath } from "next/cache";
import { z } from "zod";
import sharp from "sharp";

export async function updateOrder(input: unknown) {
  const admin = await requireAdmin();
  const parsed = orderChangeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const { error } = await createServerClient().rpc("change_order", {
    p_id: d.id,
    p_status: d.status,
    p_payment: d.payment_status,
    p_notes: d.internal_notes,
    p_tracking: d.tracking_number,
    p_reason: d.reason,
    p_actor: admin.id,
  });
  if (error) {
    const messages: Record<string, string> = {
      ROBOKASSA_PAYMENT_MANAGED:
        "Оплату Robokassa подтверждает платёжный сервис. Для возврата используйте блок возврата в карточке заказа.",
      EMPTY_ORDER:
        "В старом заказе нет состава. Сначала уточните его у покупателя.",
      PAYMENT_REASON_REQUIRED:
        "Укажите основание изменения оплаты (не менее 5 символов).",
      RETURN_REQUIRED:
        "Отправленный заказ нельзя отменить с возвратом остатка. Сначала согласуйте возврат.",
      CANCELLED_FINAL: "Отменённый заказ нельзя возобновить. Создайте новый.",
      COMPLETED_FINAL: "Завершённый заказ нельзя вернуть в работу.",
    };
    return {
      error: messages[error.message] ?? "Не удалось сохранить изменения.",
    };
  }
  revalidateTag("catalog", { expire: 0 });
  revalidatePath("/admin/orders");
  revalidatePath("/catalog");
  revalidatePath("/");
  return { success: true };
}
const imageSchema = z.object({
  id: uuid,
  storage_path: z
    .string()
    .min(1)
    .max(500)
    .refine((v) => !v.includes("..")),
  public_url: z.string().max(1000),
  bucket: z.enum(["products", "product-drafts"]),
  alt_text: z.string().max(300).nullable(),
  sort_order: z.number().int().min(0),
  is_primary: z.boolean(),
});
export async function saveProduct(
  id: string,
  input: unknown,
  imagesInput: unknown,
  expectedUpdatedAt: string | null,
) {
  await requireAdmin();
  if (!uuid.safeParse(id).success) return { error: "Некорректный товар" };
  const parsed = productSchema.safeParse(input),
    gallery = z.array(imageSchema).max(20).safeParse(imagesInput);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!gallery.success) return { error: "Проверьте фотографии" };
  if (parsed.data.publication_status === "published" && !gallery.data.length)
    return { error: "Добавьте хотя бы одну фотографию перед публикацией" };
  if (
    gallery.data.length &&
    gallery.data.filter((i) => i.is_primary).length !== 1
  )
    return { error: "Выберите одно главное фото" };
  const db = createServerClient();
  const { data: existing, error: readError } = await db
    .from("product_images")
    .select("id,storage_path,public_url,bucket")
    .eq("product_id", id);
  if (readError) return { error: "Не удалось проверить фотографии" };
  for (const image of gallery.data) {
    const old = existing?.find((i) => i.id === image.id);
    if (old) {
      if (
        old.storage_path !== image.storage_path ||
        old.bucket !== image.bucket ||
        old.public_url !== image.public_url
      )
        return { error: "Некорректная фотография" };
    } else if (
      image.bucket !== "product-drafts" ||
      image.storage_path !== `${id}/${image.id}.webp` ||
      image.public_url !== `/media/${id}/${image.id}`
    )
      return { error: "Загрузите фото через редактор" };
  }
  const { error } = await db.rpc("save_product", {
    p_id: id,
    p_data: parsed.data,
    p_images: gallery.data,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error)
    return {
      error:
        error.message === "UNIQUE_ALREADY_RESERVED"
          ? "Этот экземпляр уже зарезервирован заказом. Не увеличивайте остаток; сначала проверьте заказ."
          : error.message === "PRODUCT_CHANGED"
            ? "Изделие изменилось, возможно, появился новый заказ. Обновите страницу и проверьте остаток перед повторным сохранением."
            : error.code === "23505" || error.message === "SLUG_RESERVED"
              ? "Этот адрес уже занят. Выберите другой."
              : "Не удалось сохранить товар.",
    };
  revalidateTag("catalog", { expire: 0 });
  revalidatePath("/catalog");
  revalidatePath("/");
  revalidatePath("/admin/products");
  return { success: true };
}
export async function uploadImage(form: FormData) {
  await requireAdmin();
  const productId = form.get("productId"),
    file = form.get("file");
  if (
    (productId !== "site" && !uuid.safeParse(productId).success) ||
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > 10 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    return { error: "Допустимы JPEG, PNG и WebP до 10 МБ." };
  try {
    const original = Buffer.from(await file.arrayBuffer()),
      processor = sharp(original, { limitInputPixels: 40000000 }),
      meta = await processor.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? ""))
      return { error: "Формат изображения не поддерживается" };
    const variants = await prepareImageVariants(original);
    const display = variants[variants.length - 1].data;
    const id = crypto.randomUUID(),
      path = `${productId}/${id}.webp`,
      db = createServerClient(),
      storage = db.storage.from("product-drafts");
    const { error: originalError } = await storage.upload(
      `${productId}/${id}.original.${meta.format}`,
      original,
      { contentType: file.type, upsert: false },
    );
    if (originalError) return { error: "Не удалось загрузить оригинал" };
    const { error } = await storage.upload(path, display, {
      contentType: "image/webp",
      upsert: false,
    });
    if (error) return { error: "Не удалось загрузить фото" };
    for (let start = 0; start < variants.length; start += 3) {
      const results = await Promise.all(
        variants.slice(start, start + 3).map((variant) =>
          storage.upload(
            `${path}.v${imageVariantVersion}.w${variant.width}.webp`,
            variant.data,
            {
              contentType: "image/webp",
              upsert: false,
            },
          ),
        ),
      );
      if (results.some((result) => result.error))
        return {
          error: "Не удалось сохранить размеры фотографии. Повторите загрузку.",
        };
    }
    const { data: signed } = await storage.createSignedUrl(path, 3600);
    return {
      image: {
        id,
        storage_path: path,
        public_url:
          productId === "site"
            ? `/site-media/${id}`
            : `/media/${productId}/${id}`,
        bucket: "product-drafts" as const,
        preview_url: signed?.signedUrl ?? "",
        alt_text: null,
        sort_order: 0,
        is_primary: false,
      },
    };
  } catch {
    return {
      error: "Не удалось обработать изображение. Выберите другой файл.",
    };
  }
}

export async function retryNotification(orderId: string) {
  await requireAdmin();
  if (!uuid.safeParse(orderId).success) return { error: "Некорректный заказ" };
  const { sendOrderNotification } = await import("@/lib/notifications");
  const state = await sendOrderNotification(orderId);
  revalidatePath(`/admin/orders/${orderId}`);
  return {
    message:
      state === "sent"
        ? "Уведомление отправлено"
        : state === "unknown"
          ? "Проверьте доставку в UniSender. Автоматический повтор отключён, чтобы не отправить дубликат."
          : state === "disabled"
            ? "Канал уведомлений пока не настроен"
            : state === "busy"
              ? "Уведомление уже отправлено или выполняется отправка"
              : "Не удалось отправить. Заказ сохранён.",
  };
}
