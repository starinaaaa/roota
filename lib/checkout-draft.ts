import { z } from "zod";
import { courierContactFields } from "./courier-contact";

export const CHECKOUT_DRAFT_TTL = 7 * 86400000;
export const checkoutDeliveryDraft = z.object({
  city: z
    .object({
      name: z.string().max(100),
      latitude: z.number(),
      longitude: z.number(),
    })
    .nullable(),
  point: z
    .object({
      id: z.number().int().positive(),
      name: z.string().max(200),
      address: z.string().max(500),
      coordinates: z
        .object({ latitude: z.number(), longitude: z.number() })
        .optional(),
    })
    .nullable(),
  method: z.boolean(),
});
export type CheckoutDeliveryDraft = z.infer<typeof checkoutDeliveryDraft>;
const draftSchema = z.object({
  ...courierContactFields,
  savedAt: z.number(),
  legalVersion: z.string(),
  firstName: z.string().max(50),
  lastName: z.string().max(50),
  phone: z.string().max(40),
  email: z.string().max(254),
  telegram: z.string().max(33),
  comment: z.string().max(2000),
  emailConsent: z.boolean(),
  delivery: checkoutDeliveryDraft.nullable(),
  deliveryMethod: z
    .enum(["ozon_point", "yandex_courier"])
    .default("ozon_point"),
  address: z.string().max(500).default(""),
  splitShipments: z.boolean().default(false),
});
export function readCheckoutDraft(raw: string | null, now = Date.now()) {
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw ?? "null"));
    if (
      !parsed.success ||
      parsed.data.savedAt > now ||
      now - parsed.data.savedAt > CHECKOUT_DRAFT_TTL
    )
      return null;
    return {
      ...parsed.data,
      // A saved browser draft is not evidence of a new affirmative choice.
      emailConsent: false,
    };
  } catch {
    return null;
  }
}
