import { z } from "zod";
// Ozon Delivery API /v1/posting/info and /v1/posting/status-history, checked 2026-10-11.
// https://docs.ozon.ru/api/ozon-delivery/#operation/PostingInfo
export const postingInfoSchema = z.object({
  postings: z.array(
    z.object({
      posting_number: z.string().min(1).max(200),
      status: z.string().min(1).max(100),
      status_changed_at: z.iso.datetime({ offset: true }),
    }),
  ),
});
export const postingHistorySchema = z.object({
  history: z.array(
    z.object({
      status: z.string().min(1).max(100),
      status_changed_at: z.iso.datetime({ offset: true }),
    }),
  ),
});
