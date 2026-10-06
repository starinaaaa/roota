import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { ozonConfigured, shipmentMethodId } from "@/lib/delivery/ozon";
import PackingEditor from "@/components/admin/PackingEditor";
export default async function DeliveryPage() {
  await requireAdmin();
  const db = createServerClient();
  const [rules, categories, points, sync] = await Promise.all([
    db.from("delivery_packing_rules").select("*").order("name"),
    db.from("categories").select("id,name").order("sort_order"),
    db
      .from("delivery_points")
      .select("id", { count: "exact", head: true })
      .eq("provider", "ozon")
      .eq("active", true),
    db
      .from("delivery_sync")
      .select("updated_at")
      .eq("provider", "ozon")
      .maybeSingle(),
  ]);
  if (rules.error || categories.error || points.error)
    throw new Error("Не удалось загрузить настройки доставки.");
  let connection = "Ключи Ozon не настроены.";
  if (ozonConfigured())
    try {
      connection = `Подключено к Ozon. ID метода доставки: ${await shipmentMethodId()}`;
    } catch (e) {
      connection =
        e instanceof Error ? e.message : "Не удалось подключиться к Ozon.";
    }
  return (
    <>
      <p className="mb-6 text-sm" role="status">
        {connection}
      </p>
      <PackingEditor
        rules={rules.data ?? []}
        categories={categories.data ?? []}
        configured={ozonConfigured()}
        pointCount={points.count ?? 0}
        syncedAt={sync.data?.updated_at ?? null}
      />
    </>
  );
}
