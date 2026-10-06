import type { SupabaseClient } from "@supabase/supabase-js";
import type { OzonTransport } from "./ozon-transport";
import type { OzonPointInfo } from "./ozon";
import { OzonApiError } from "./ozon-transport";

// Ozon can list an ID whose detail endpoint already returns 404. Isolate that
// record so one retired point cannot block every following catalogue page.
async function catalogInfo(
  transport: Pick<OzonTransport, "call">,
  ids: number[],
): Promise<{ points: OzonPointInfo[]; missing: number[] }> {
  if (!ids.length) return { points: [], missing: [] };
  try {
    const data = await transport.call<{ delivery_points: OzonPointInfo[] }>(
      "/v1/delivery-point/info",
      { delivery_point_ids: ids },
    );
    if (!Array.isArray(data.delivery_points))
      throw new Error("Не удалось получить пункты выдачи.");
    return {
      points: data.delivery_points,
      missing: ids.filter(
        (id) => !data.delivery_points.some((p) => p.delivery_point_id === id),
      ),
    };
  } catch (error) {
    if (!(error instanceof OzonApiError) || error.status !== 404) throw error;
    if (ids.length === 1) return { points: [], missing: ids };
    const middle = Math.floor(ids.length / 2);
    const left = await catalogInfo(transport, ids.slice(0, middle));
    const right = await catalogInfo(transport, ids.slice(middle));
    return {
      points: [...left.points, ...right.points],
      missing: [...left.missing, ...right.missing],
    };
  }
}
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
  let saved = 0;
  if (ids.length) {
    const info = await catalogInfo(transport, ids);
    saved = info.points.filter((p) => p.is_active && p.type === "pvz").length;
    if (info.missing.length) {
      const { error } = await db
        .from("delivery_points")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("provider", "ozon")
        .in("id", info.missing);
      if (error) throw new Error("Не удалось обновить недоступные пункты.");
      console.info(
        "Ozon catalogue: unavailable IDs skipped",
        info.missing.length,
      );
    }
    const { error } = info.points.length
      ? await db.from("delivery_points").upsert(
          info.points.map((p) => ({
            provider: "ozon",
            id: p.delivery_point_id,
            name: p.name,
            address: p.full_address,
            active: p.is_active && p.type === "pvz",
            data: p,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "provider,id" },
        )
      : { error: null };
    if (error) throw new Error("Не удалось сохранить пункты выдачи.");
  }
  const nextCursor = data.delivery_points.length
    ? (data.next_cursor ?? null)
    : null;
  if (nextCursor && nextCursor === sync?.cursor)
    throw new Error("Ozon вернул повторяющуюся страницу пунктов.");
  const { error } = await db.from("delivery_sync").upsert({
    provider: "ozon",
    cursor: nextCursor,
    updated_at: new Date().toISOString(),
    ...(!nextCursor ? { completed_at: new Date().toISOString() } : {}),
  });
  if (error) throw new Error("Не удалось сохранить состояние загрузки.");
  return { count: saved, more: Boolean(nextCursor) };
}

export async function syncCatalog(
  db: SupabaseClient,
  transport: Pick<OzonTransport, "call">,
  method: number,
  budgetMs = 20000,
) {
  const owner = crypto.randomUUID();
  const { data: acquired, error } = await db.rpc("claim_delivery_sync", {
    p_owner: owner,
  });
  if (error) throw new Error("Не удалось начать обновление пунктов.");
  if (!acquired)
    throw new Error("Каталог уже обновляется автоматически. Повторите позже.");
  let count = 0;
  const start = Date.now();
  try {
    do {
      const page = await syncCatalogPage(db, transport, method);
      count += page.count;
      if (!page.more) return { count, more: false };
    } while (Date.now() - start < budgetMs);
    return { count, more: true };
  } finally {
    await db.rpc("release_delivery_sync", { p_owner: owner });
  }
}
