import { postingHistorySchema } from "./posting-status";
import type { postingInfoSchema } from "./posting-status";
import type { z } from "zod";
import type { OzonTransport } from "./ozon-transport";
import type { CarrierPosting } from "./parcel-status";

import { orderedHistory } from "./tracking-format";

// Shared request budget bounds a cron run even for orders with many parcels.
export async function enrichPostingTracking(
  transport: Pick<OzonTransport, "call">,
  expected: CarrierPosting[],
  incoming: z.infer<typeof postingInfoSchema>["postings"],
  budget = { remaining: 8 },
): Promise<CarrierPosting[]> {
  const byNumber = new Map(incoming.map((p) => [p.posting_number, p]));
  const output: CarrierPosting[] = [];
  for (const previous of expected) {
    const info = byNumber.get(previous.posting_number);
    if (!info) throw new Error("POSTING_NOT_FOUND");
    const posting: CarrierPosting = {
      ...previous,
      ...info,
      original_delivery_at: info.original_delivery_at ?? null,
      delivery_at: info.delivery_at ?? null,
      storage_expires_at: info.storage_expires_at ?? null,
    };
    const needsHistory =
      !previous.history?.length ||
      previous.history_error ||
      previous.history_for_status_changed_at !== info.status_changed_at;
    if (needsHistory) posting.history_error = true;
    if (needsHistory && budget.remaining > 0) {
      budget.remaining--;
      try {
        const result = postingHistorySchema.parse(
          await transport.call("/v1/posting/status-history", {
            posting_number: info.posting_number,
          }),
        );
        posting.history = orderedHistory(result.history);
        // An eventually consistent history can lag behind posting/info.
        const caughtUp = result.history.some(
          (e) =>
            e.status === info.status &&
            Date.parse(e.status_changed_at) ===
              Date.parse(info.status_changed_at),
        );
        posting.history_for_status_changed_at = caughtUp
          ? info.status_changed_at
          : undefined;
        posting.history_error = !caughtUp;
      } catch {
        posting.history_error = true;
      }
    }
    output.push(posting);
  }
  return output;
}
