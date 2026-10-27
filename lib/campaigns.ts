import { z } from "zod";
export const campaignSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(150),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((s) => !/[\r\n]/.test(s)),
  body: z.string().trim().min(1).max(8000),
  product_ids: z.array(z.uuid()).min(1).max(50),
  recipient_ids: z.array(z.uuid()).max(10000),
});
export type CampaignContent = z.infer<typeof campaignSchema>;
