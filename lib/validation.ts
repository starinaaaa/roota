import { normalizeRussianPhone } from "./contacts";
import { z } from "zod";
export const uuid = z.string().uuid();
export const phone = z
  .string()
  .max(40)
  .transform((v, ctx) => {
    const normalized = normalizeRussianPhone(v);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Укажите российский телефон: +7 и 10 цифр",
      });
      return z.NEVER;
    }
    return normalized;
  });
export const checkoutSchema = z
  .object({
    name: z.string().trim().min(1, "Укажите имя").max(100),
    phone,
    email: z
      .string()
      .trim()
      .email("Укажите корректный email")
      .max(254)
      .refine(
        (v) => /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(v),
        "Укажите корректный email",
      ),
    deliveryType: z.enum(["moscow", "russia", "pickup"]),
    address: z.string().trim().max(500),
    comment: z.string().trim().max(2000),
    subscribeToNews: z.boolean().optional().default(false),
    deliveryQuoteId: uuid.optional(),
  })
  .refine((v) => v.deliveryType === "pickup" || v.address.length >= 5, {
    message: "Укажите адрес доставки",
    path: ["address"],
  });
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);
export const productSchema = z
  .object({
    name: z.string().trim().min(1, "Укажите название").max(150),
    slug: z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Адрес: латинские буквы, цифры и дефисы",
      )
      .max(120),
    description: z.string().trim().max(5000),
    category_id: uuid.nullable(),
    price: z.number().int().min(0).max(10000000),
    stock_qty: z.number().int().min(0).max(100000),
    material: optionalText(300),
    dimensions: optionalText(300),
    weight: optionalText(100),
    care: optionalText(2000),
    dishwasher_safe: z.boolean().nullable(),
    microwave_safe: z.boolean().nullable(),
    publication_status: z.enum(["draft", "published", "archived"]),
    preorder_enabled: z.boolean(),
    lead_time_days: z.number().int().min(1).max(365).nullable(),
    featured: z.boolean(),
    seo_title: optionalText(100),
    seo_description: optionalText(300),
  })
  .refine((v) => !v.preorder_enabled || v.lead_time_days !== null, {
    message: "Укажите срок изготовления",
    path: ["lead_time_days"],
  })
  .refine(
    (v) =>
      v.publication_status !== "published" ||
      (v.price > 0 && v.description.length > 0 && v.category_id !== null),
    {
      message: "Для публикации нужны описание, категория и положительная цена",
    },
  );
export const orderChangeSchema = z.object({
  id: uuid,
  status: z.enum(["new", "confirmed", "shipped", "delivered", "cancelled"]),
  payment_status: z.enum(["pending", "paid", "failed", "refunded"]),
  internal_notes: z.string().max(5000),
  tracking_number: z.string().max(200),
  reason: z.string().trim().max(1000),
});
export const orderLabels: Record<string, string> = {
  new: "Новый",
  confirmed: "Собирается",
  in_production: "Собирается",
  shipped: "Отправлен",
  delivered: "Завершён",
  cancelled: "Отменён",
};
export const paymentLabels: Record<string, string> = {
  pending: "Ожидается",
  paid: "Оплачен",
  failed: "Не прошла",
  refunded: "Возвращена",
};
export const publicationLabels: Record<string, string> = {
  draft: "Черновик",
  published: "Опубликован",
  archived: "Архив",
};
export type ProductInput = z.infer<typeof productSchema>;
