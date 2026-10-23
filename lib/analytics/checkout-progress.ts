import { z } from "zod";

export const checkoutStages = {
  checkout_opened: "Открыл оформление",
  delivery_started: "Выбирал доставку",
  point_selected: "Выбрал ПВЗ",
  delivery_quote_seen: "Получил стоимость доставки",
  delivery_error: "Ошибка расчёта доставки",
  validation_error: "Не прошла проверка полей",
  order_error: "Ошибка создания заказа",
} as const;
export const checkoutProgressInput = z
  .object({
    stage: z.enum(
      Object.keys(checkoutStages) as [
        keyof typeof checkoutStages,
        ...(keyof typeof checkoutStages)[],
      ],
    ),
    method: z.enum(["ozon_point", "yandex_courier"]),
    point: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    quote: z.uuid().optional(),
  })
  .strict()
  .refine(
    (value) => value.stage !== "delivery_quote_seen" || Boolean(value.quote),
    "Quote required",
  );
export type CheckoutProgressInput = z.infer<typeof checkoutProgressInput>;
