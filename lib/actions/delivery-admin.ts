"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { createServerClient } from "@/lib/supabase/server";
import {
  ozonTransport,
  pointInfo,
  shipmentMethodId,
} from "@/lib/delivery/ozon";
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
export async function syncDeliveryPoints() {
  await requireAdmin();
  const db = createServerClient();
  try {
    const { data: sync, error: syncError } = await db
      .from("delivery_sync")
      .select("cursor")
      .eq("provider", "ozon")
      .maybeSingle();
    if (syncError) throw new Error("Не удалось прочитать состояние загрузки.");
    const data = await ozonTransport().call<{
      delivery_points: {
        delivery_point_id: number;
        shipment_method_ids: number[];
      }[];
      next_cursor?: string | null;
    }>("/v1/delivery-point/list", {
      pagination: { cursor: sync?.cursor ?? "", limit: 100 },
    });
    if (!Array.isArray(data.delivery_points))
      throw new Error("Не удалось получить список пунктов.");
    const method = await shipmentMethodId();
    const ids = data.delivery_points
      .filter((p) =>
        Array.isArray(p.shipment_method_ids)
          ? p.shipment_method_ids.includes(method)
          : Number(p.shipment_method_ids) === method,
      )
      .map((p) => p.delivery_point_id);
    if (ids.length) {
      const info = await pointInfo(ids);
      const { error } = await db.from("delivery_points").upsert(
        info.map((p) => ({
          provider: "ozon",
          id: p.delivery_point_id,
          name: p.name,
          address: p.full_address,
          active: p.is_active && p.type === "pvz",
          data: p,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "provider,id" },
      );
      if (error) throw new Error("Не удалось сохранить пункты выдачи.");
    }
    if (data.next_cursor && data.next_cursor === sync?.cursor)
      throw new Error(
        "Не удалось продолжить загрузку пунктов. Повторите позже.",
      );
    const { error } = await db
      .from("delivery_sync")
      .upsert({
        provider: "ozon",
        cursor: data.next_cursor ?? null,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error("Не удалось сохранить состояние загрузки.");
    revalidatePath("/admin/delivery");
    return { count: ids.length, more: Boolean(data.next_cursor) };
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
