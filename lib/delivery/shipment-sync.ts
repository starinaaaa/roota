import "server-only";
import { createServerClient } from "@/lib/db";
import { ozonTransport } from "./ozon";
import {
  shipmentPostings,
  aggregatePostingStatus,
  type CarrierPosting,
} from "./parcel-status";
import { postingInfoSchema } from "./posting-status";
import { enrichPostingTracking } from "./posting-tracking";

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
    status_history?: { postings?: CarrierPosting[] };
  }[];
  if (!rows.length) return { checked: 0, updated: 0, failed: 0 };
  const result = { checked: rows.length, updated: 0, failed: 0 };
  try {
    const transport = ozonTransport();
    // 1–100 posting numbers per request are supported by Ozon; claim batches of 20.
    const numbers = [
      ...new Set(
        rows.flatMap((row) =>
          shipmentPostings(row).map((p) => p.posting_number),
        ),
      ),
    ];
    const byNumber = new Map<
      string,
      ReturnType<typeof postingInfoSchema.parse>["postings"][number]
    >();
    for (let offset = 0; offset < numbers.length; offset += 100) {
      const info = postingInfoSchema.parse(
        await transport.call("/v1/posting/info", {
          posting_numbers: numbers.slice(offset, offset + 100),
        }),
      );
      for (const posting of info.postings)
        byNumber.set(posting.posting_number, posting);
    }
    const historyBudget = { remaining: 8 };
    const syncOne = async (row: (typeof rows)[number]) => {
      try {
        const expected = shipmentPostings(row);
        const postings = expected.map((p) => byNumber.get(p.posting_number));
        if (postings.some((p) => !p)) throw new Error("POSTING_NOT_FOUND");
        const status = aggregatePostingStatus(
          postings as NonNullable<(typeof postings)[number]>[],
        );
        const { data: previous } = await db
          .from("order_shipments")
          .select("carrier_status,status_history")
          .eq("order_id", row.order_id)
          .single();
        if (previous?.status_history?.replacement && previous.status_history.replacement.phase !== "done")
          throw new Error("REPLACEMENT_IN_PROGRESS");
        const enriched = await enrichPostingTracking(transport,
          shipmentPostings({ ...row, status_history: previous?.status_history }),
          postings as NonNullable<(typeof postings)[number]>[], historyBudget);
        const { data, error: saveError } = await db.rpc(
          "apply_order_shipment_status",
          {
            p_order: row.order_id,
            p_posting: row.posting_number,
            p_status: status,
            p_changed: postings
              .map((p) => p!.status_changed_at)
              .sort()
              .at(-1),
            p_history: {
              ...previous?.status_history,
              ...(enriched[0]?.history ? { history: enriched[0].history } : {}),
              postings: enriched,
            },
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
