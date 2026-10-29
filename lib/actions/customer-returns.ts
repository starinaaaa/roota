"use server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { orderIdForToken } from "@/lib/order-access";
import { getPool, transaction } from "@/lib/db/pool";
import { storage } from "@/lib/storage";
import {
  saveReturnApplication,
  receivedOrderSelection,
} from "@/lib/return-request-service";
import { returnRequestSchema } from "@/lib/delivery/return-model";
export type ReturnFormState = { error?: string; saved?: boolean };
export async function submitReturnRequest(
  _previous: ReturnFormState,
  form: FormData,
): Promise<ReturnFormState> {
  const token = String(form.get("token") ?? "");
  const parsed = returnRequestSchema.safeParse({
    reason: form.get("reason"),
    description: form.get("description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const photos = form
    .getAll("photos")
    .filter((file): file is File => file instanceof File && file.size > 0);
  if (
    photos.length > 3 ||
    photos.some(
      (p) =>
        p.size > 3 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(p.type),
    )
  )
    return {
      error: "Прикрепите до 3 фотографий JPEG, PNG или WebP, до 3 МБ каждая.",
    };
  if (parsed.data.reason !== "other" && !photos.length)
    return {
      error:
        "Прикрепите фотографию изделия и упаковки. Если загрузка не получается, напишите студии.",
    };
  const paths: string[] = [];
  let committed = false;
  let persistenceStarted = false;
  try {
    const orderId = await orderIdForToken(token);
    if (!orderId)
      return {
        error: "Не удалось открыть заказ. Проверьте персональную ссылку.",
      };
    const { rows } = await getPool().query(receivedOrderSelection, [orderId]);
    if (!rows.length)
      return {
        error:
          "Заявка доступна после получения хотя бы одной посылки. По вопросам доставки напишите студии.",
      };
    const existing = await getPool().query(
      `select id from customer_return_requests where order_id=$1 and status<>'closed'`,
      [orderId],
    );
    if (existing.rows.length)
      return {
        error:
          "Заявка уже получена. Её статус и ответ студии — на странице заказа.",
      };
    const recent = await getPool().query(
      `select count(*)::int as count from customer_return_requests where order_id=$1 and created_at>now()-interval '30 days'`,
      [orderId],
    );
    if (recent.rows[0].count >= 3)
      return {
        error:
          "По этому заказу уже есть несколько обращений. Напишите студии, чтобы продолжить обсуждение.",
      };
    for (const photo of photos) {
      // Re-encode and remove metadata; never trust extension or browser MIME alone.
      const buffer = await sharp(Buffer.from(await photo.arrayBuffer()), {
        limitInputPixels: 25000000,
      })
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const path = `${orderId}/${randomUUID()}.jpg`;
      const result = await storage
        .from("return-photos")
        .upload(path, buffer, { contentType: "image/jpeg", upsert: false });
      if (result.error) throw new Error("PHOTO_UPLOAD_FAILED");
      paths.push(path);
    }
    persistenceStarted = true;
    await transaction(async (client) => {
      await saveReturnApplication(client, orderId, {
        ...parsed.data,
        photos: paths,
      });
    });
    committed = true;
    revalidatePath(`/order/${token}`);
    revalidatePath("/admin/returns");
    return { saved: true };
  } catch {
    if (!committed && !persistenceStarted && paths.length)
      await storage.from("return-photos").remove(paths);
    return {
      error:
        "Не удалось сохранить заявку. Обновите страницу: возможно, она уже создана. Если её нет, повторите позже или напишите студии.",
    };
  }
}
