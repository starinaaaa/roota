import type { SupabaseClient } from "@supabase/supabase-js";
import type { OzonTransport } from "./ozon-transport";
import type { OzonPointInfo } from "./ozon";
// Shared by the protected admin action and initial production catalogue bootstrap.
export async function syncCatalogPage(
  db: SupabaseClient,
  transport: Pick<OzonTransport, "call">,
  method: number,
) {
  const { data: sync, error: readError } = await db
    .from("delivery_sync")
    .select("cursor")
    .eq("provider", "ozon")
    .maybeSingle();
  if (readError) throw new Error("Не удалось прочитать состояние загрузки.");
  const data = await transport.call<{
    delivery_points: {
      delivery_point_id: number;
      shipment_method_ids: number[];
    }[];
    next_cursor?: string | null;
  }>("/v1/delivery-point/list", {
    pagination: {
      ...(sync?.cursor ? { cursor: sync.cursor } : {}),
      limit: 100,
    },
  });
  if (!Array.isArray(data.delivery_points))
    throw new Error("Не удалось получить список пунктов.");
  const ids = data.delivery_points
    .filter((p) =>
      Array.isArray(p.shipment_method_ids)
        ? p.shipment_method_ids.map(Number).includes(method)
        : Number(p.shipment_method_ids) === method,
    )
    .map((p) => Number(p.delivery_point_id));
  if (ids.length) {
    const info = await transport.call<{ delivery_points: OzonPointInfo[] }>(
      "/v1/delivery-point/info",
      { delivery_point_ids: ids },
    );
    if (!Array.isArray(info.delivery_points))
      throw new Error("Не удалось получить пункты выдачи.");
    const { error } = await db.from("delivery_points").upsert(
      info.delivery_points.map((p) => ({
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
    throw new Error("Ozon вернул повторяющуюся страницу пунктов.");
  const { error } = await db.from("delivery_sync").upsert({
    provider: "ozon",
    cursor: data.next_cursor ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Не удалось сохранить состояние загрузки.");
  return { count: ids.length, more: Boolean(data.next_cursor) };
}
