import { z } from "zod";
import { gardenConfigurationSchema } from "./garden";
export const manualItemSchema = z
  .object({
    product_id: z.uuid().nullable(),
    name: z.string().trim().min(1).max(150),
    price: z.number().int().min(1).max(10000000),
    quantity: z.number().int().min(1).max(100),
    mode: z.enum(["stock", "preorder"]),
    lead_days: z.number().int().min(1).max(365).nullable(),
    configuration: gardenConfigurationSchema.nullable().default(null),
  })
  .refine(
    (i) => i.mode !== "preorder" || i.lead_days !== null,
    "Укажите срок изготовления",
  )
  .refine(
    (i) => i.product_id !== null || i.mode === "preorder",
    "Индивидуальное изделие оформляется как предзаказ",
  )
  .refine(
    (i) => !i.configuration || (i.quantity === 1 && i.mode === "preorder"),
    "Сад: одна конфигурация на строку",
  );
export const manualDraftSchema = z
  .object({
    customer_name: z.string().trim().min(2).max(100),
    email: z.email().max(254),
    phone: z.string().max(40),
    items: z.array(manualItemSchema).min(1).max(50),
    delivery_method: z.enum(["pickup", "yandex_courier", "agreed"]),
    delivery_address: z.string().trim().max(500),
    delivery_amount: z.number().int().min(0).max(100000),
    comment: z.string().trim().max(2000),
  })
  .refine(
    (d) => d.delivery_method === "pickup" || d.delivery_address.length >= 5,
    "Укажите адрес или согласованный способ получения",
  )
  .refine(
    (d) => d.delivery_method !== "yandex_courier" || d.delivery_amount === 0,
    "Курьер оплачивается отдельно",
  )
  .refine(
    (d) =>
      d.items.reduce((n, i) => n + i.price * i.quantity, d.delivery_amount) <=
      10000000,
    "Сумма заказа слишком велика",
  );
export type ManualItem = z.infer<typeof manualItemSchema>;
export type ManualDraft = z.infer<typeof manualDraftSchema>;
