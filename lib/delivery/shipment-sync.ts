import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ozonTransport } from "./ozon";
import { postingInfoSchema, postingHistorySchema } from "./posting-status";

export async function syncOrderShipments() {
  const db = createServerClient();
  const { data: claimed, error } = await db.rpc("claim_order_shipment_sync", {
    p_limit: 20,
  });
  if (error) throw new Error("Не удалось получить отправления");
  const rows = claimed as {
    order_id: string;
    posting_number: string;
    sync_claim: string;
  }[];
  if (!rows.length) return { checked: 0, updated: 0, failed: 0 };
  const result = { checked: rows.length, updated: 0, failed: 0 };
  try {
    const transport = ozonTransport();
    // 1–100 posting numbers per request are supported by Ozon; claim batches of 20.
    const info = postingInfoSchema.parse(
      await transport.call("/v1/posting/info", {
        posting_numbers: rows.map((row) => row.posting_number),
      }),
    );
    const byNumber = new Map(info.postings.map((p) => [p.posting_number, p]));
    const syncOne = async (row: (typeof rows)[number]) => {
      try {
        const posting = byNumber.get(row.posting_number);
        if (!posting) throw new Error("POSTING_NOT_FOUND");
        const { data: previous } = await db
          .from("order_shipments")
          .select("carrier_status,status_history")
          .eq("order_id", row.order_id)
          .single();
        let history = previous?.status_history;
        if (previous?.carrier_status !== posting.status || !history?.history) {
          // History enriches the page but its outage must not block the current trusted status.
          try {
            history = postingHistorySchema.parse(
              await transport.call("/v1/posting/status-history", {
                posting_number: row.posting_number,
              }),
            );
          } catch {
            /* Retry when the status changes or on manual refresh. */
          }
        }
        const { data, error: saveError } = await db.rpc(
          "apply_order_shipment_status",
          {
            p_order: row.order_id,
            p_posting: row.posting_number,
            p_status: posting.status,
            p_changed: posting.status_changed_at,
            p_history: history ?? {},
            p_claim: row.sync_claim,
          },
        );
        if (saveError) throw new Error("Не удалось сохранить статус");
        if (data) result.updated++;
      } catch (error) {
        result.failed++;
        await db
          .from("order_shipments")
          .update({
            last_error:
              error instanceof Error && error.message === "POSTING_NOT_FOUND"
                ? "Ozon не нашёл отправление. Проверьте его номер и аккаунт Ozon. Повторим проверку автоматически."
                : "Не удалось обновить доставку. Повторим автоматически.",
            next_sync_at: new Date(Date.now() + 15 * 60000).toISOString(),
            sync_claim: null,
          })
          .eq("order_id", row.order_id)
          .eq("sync_claim", row.sync_claim);
      }
    };
    // Bound history requests: a batch of 20 completes inside the five-minute lease.
    for (let offset = 0; offset < rows.length; offset += 3) {
      await Promise.all(rows.slice(offset, offset + 3).map(syncOne));
    }
  } catch {
    result.failed = rows.length;
    for (const row of rows)
      await db
        .from("order_shipments")
        .update({
          last_error: "Ozon временно недоступен. Повторим автоматически.",
          next_sync_at: new Date(Date.now() + 15 * 60000).toISOString(),
          sync_claim: null,
        })
        .eq("order_id", row.order_id)
        .eq("sync_claim", row.sync_claim);
  }
  return result;
}
