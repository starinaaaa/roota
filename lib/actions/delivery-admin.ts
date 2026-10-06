"use server";
import { z } from "zod";
import { syncCatalogPage } from "@/lib/delivery/catalog-sync";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { createServerClient } from "@/lib/supabase/server";
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
    const result = await syncCatalogPage(
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
