import { z } from "zod";
import { checkoutErrorFields } from "./checkout-errors";

export const checkoutStages = {
  checkout_opened: "Открыл оформление",
  delivery_started: "Выбирал доставку",
  point_selected: "Выбрал ПВЗ",
  delivery_quote_seen: "Получил стоимость доставки",
  delivery_error: "Ошибка расчёта доставки",
  validation_error: "Не прошла проверка полей",
  error_corrected: "Ошибка исправлена",
  order_error: "Ошибка создания заказа",
} as const;
export const checkoutProgressInput = z
  .object({
    field: z.enum(checkoutErrorFields).optional(),
    code: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/).optional(),
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
