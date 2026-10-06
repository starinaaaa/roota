import "server-only";
import { requireAdmin } from "./auth";
import { createServerClient } from "./supabase/server";
import { uuid, orderLabels, paymentLabels } from "./validation";
export async function listOrders(q = "", status = "", payment = "", page = 1) {
  await requireAdmin();
  const db = createServerClient(),
    safe = q.replace(/[^\p{L}\p{N}\s+@.-]/gu, "").slice(0, 100);
  let query = db
    .from("orders")
    .select(
      "id,order_number,created_at,customer_name,total_amount,status,payment_status,reservation_state",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });
  if (safe)
    query = query.or(
      `order_number.ilike.%${safe}%,customer_name.ilike.%${safe}%`,
    );
  if (status && status in orderLabels) query = query.eq("status", status);
  if (payment && payment in paymentLabels)
    query = query.eq("payment_status", payment);
  const { data, error, count } = await query.range(
    (page - 1) * 30,
    page * 30 - 1,
  );
  if (error) throw new Error("Не удалось загрузить заказы");
  return { orders: data ?? [], count: count ?? 0 };
}
export async function getOrder(id: string) {
  await requireAdmin();
  if (!uuid.safeParse(id).success) return null;
  const { data, error } = await createServerClient()
    .from("orders")
    .select(
      "*,items:order_items(*),events:order_events(*),notification:notification_outbox(state,attempts),shipments:order_shipments(*)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Не удалось загрузить заказ");
  return data;
}
export async function listAdminProducts() {
  await requireAdmin();
  const { data, error } = await createServerClient()
    .from("products")
    .select(
      "id,name,slug,price,stock_qty,publication_status,preorder_enabled,featured",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error("Не удалось загрузить товары");
  return data ?? [];
}
export async function getAdminProduct(id: string) {
  await requireAdmin();
  if (!uuid.safeParse(id).success) return null;
  const db = createServerClient();
  const { data, error } = await db
    .from("products")
    .select("*,images:product_images(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Не удалось загрузить товар");
  if (!data) return null;
  const images = await Promise.all(
    data.images
      .sort(
        (a: { sort_order: number }, b: { sort_order: number }) =>
          a.sort_order - b.sort_order,
      )
      .map(
        async (image: {
          bucket: string;
          storage_path: string;
          public_url: string;
        }) => {
          const { data: signed } =
            image.bucket === "product-drafts"
              ? await db.storage
                  .from(image.bucket)
                  .createSignedUrl(image.storage_path, 3600)
              : { data: null };
          return {
            ...image,
            preview_url: signed?.signedUrl ?? image.public_url,
          };
        },
      ),
  );
  return { ...data, images };
}
