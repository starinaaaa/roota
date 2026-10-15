import { z } from "zod";

// Never store query strings, personal order links, contact details or raw errors.
import { funnelPagePattern } from "./values";
export { campaignValue } from "./values";
export const analyticsInput = z.object({
  error: z
    .enum([
      "payment_widget",
      "payment_status",
      "payment_failed",
      "payment_expired",
    ])
    .optional(),
  page: z.string().regex(funnelPagePattern).max(180),
  source: z
    .string()
    .max(80)
    .regex(/^[\p{L}\p{N}_. -]*$/u)
    .default(""),
  medium: z
    .string()
    .max(80)
    .regex(/^[\p{L}\p{N}_. -]*$/u)
    .default(""),
  campaign: z
    .string()
    .max(80)
    .regex(/^[\p{L}\p{N}_. -]*$/u)
    .default(""),
});
