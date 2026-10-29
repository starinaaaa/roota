import { z } from "zod";
// Ozon Delivery API; keep only fields that the shop needs, never recipient data.
const date = z.iso.datetime({ offset: true });
export const postingEventSchema = z.object({
  status: z.string().min(1).max(100),
  status_changed_at: date,
});
export type PostingEvent = z.infer<typeof postingEventSchema>;
export const postingInfoSchema = z.object({
  postings: z.array(
    postingEventSchema.extend({
      posting_number: z.string().min(1).max(200),
      original_delivery_at: date.nullish(),
      delivery_at: date.nullish(),
      storage_expires_at: date.nullish(),
      estimated_delivery_days: z.number().int().nonnegative().nullish(),
    }),
  ),
});
export const postingHistorySchema = z.object({
  history: z.array(postingEventSchema),
});
