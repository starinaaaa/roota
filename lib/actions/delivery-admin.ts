"use server";
import { z } from "zod";
import { syncCatalog } from "@/lib/delivery/catalog-sync";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { getPool } from "@/lib/db/pool";
import { recreatePaidShipment } from "@/lib/delivery/recreate-shipment";
import { createServerClient } from "@/lib/db";
import { ozonTransport, shipmentMethodId } from "@/lib/delivery/ozon";
import {
  createPaidShipment,
  refreshShipmentStatus,
} from "@/lib/delivery/shipments";
const ruleSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(100),
  composition: z
    .array(
      z.object({
        category_id: uuid,
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(20)
    .refine(
      (v) => new Set(v.map((i) => i.category_id)).size === v.length,
      "Укажите каждую категорию один раз",
    ),
  weight_g: z.number().int().min(1).max(100000),
  length_mm: z.number().int().min(1).max(3000),
  width_mm: z.number().int().min(1).max(3000),
  height_mm: z.number().int().min(1).max(3000),
  active: z.boolean(),
  garden_size: z.number().int().min(1).max(100).nullable().optional(),
});
export async function savePackingRule(input: unknown) {
  await requireAdmin();
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data,
    db = createServerClient();
  d.composition.sort((a, b) => a.category_id.localeCompare(b.category_id));
  const { data: categories } = await db
    .from("categories")
    .select("id")
    .in(
      "id",
      d.composition.map((c) => c.category_id),
    );
  if (categories?.length !== d.composition.length)
    return { error: "Выберите существующие категории." };
  const { error } = d.id
    ? await db.from("delivery_packing_rules").update(d).eq("id", d.id)
    : await db.from("delivery_packing_rules").insert(d);
  if (error) return { error: "Не удалось сохранить правило упаковки." };
  revalidatePath("/admin/delivery");
  return { success: true };
}
export async function syncDeliveryPoints(): Promise<{
  count?: number;
  more?: boolean;
  error?: string;
}> {
  await requireAdmin();
  const db = createServerClient();
  try {
    const result = await syncCatalog(
      db,
      ozonTransport(),
      await shipmentMethodId(),
    );
    revalidatePath("/admin/delivery");
    return result;
  } catch (e) {
    return {
      error:
        e instanceof Error && !/fetch|JSON|network/i.test(e.message)
          ? e.message
          : "Не удалось обновить пункты выдачи.",
    };
  }
}
export async function createOzonShipment(id: unknown) {
  await requireAdmin();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { error: "Неверный заказ." };
  try {
    const result = await createPaidShipment(parsed.data);
    revalidatePath("/admin/orders/" + parsed.data);
    return { message: result };
  } catch (e) {
    return {
      error:
        e instanceof Error && !/fetch|JSON|network/i.test(e.message)
          ? e.message
          : "Не удалось создать отправление. Повторите с тем же заказом.",
    };
  }
}
export async function refreshOzonShipment(id: unknown) {
  await requireAdmin();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { error: "Неверный заказ." };
  try {
    await refreshShipmentStatus(parsed.data);
    revalidatePath("/admin/orders/" + parsed.data);
    return { message: "Статус доставки обновлён." };
  } catch {
    return { error: "Не удалось обновить статус доставки." };
  }
}

export async function recreateOzonShipment(id: unknown) {
  await requireAdmin();
  if (
    process.env.APP_ENV !== "production" ||
    process.env.OZON_SHIPMENTS_ENABLED !== "true"
  )
    return {
      error: "Создание реальных отправлений отключено для этого окружения.",
    };
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { error: "Неверный заказ." };
  try {
    const { data: shipment, error } = await createServerClient()
      .from("order_shipments")
      .select("posting_number")
      .eq("order_id", parsed.data)
      .single();
    if (error || !shipment?.posting_number)
      return { error: "Отправление не найдено." };
    const result = await recreatePaidShipment({
      db: getPool(),
      transport: ozonTransport(),
      orderId: parsed.data,
      expectedPosting: shipment.posting_number,
      apply: true,
    });
    revalidatePath("/admin/orders/" + parsed.data);
    return {
      message: result.alreadyReplaced
        ? "Отправления уже заменены."
        : "Созданы новые отправления по действующим правилам. Сумма для покупателя сохранена.",
    };
  } catch (e) {
    return {
      error:
        e instanceof Error &&
        !/fetch|JSON|network|SQL|constraint/i.test(e.message)
          ? e.message
          : "Не удалось пересоздать отправления. Повторите с тем же заказом.",
    };
  }
}
