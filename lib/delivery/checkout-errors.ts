// Provider failures are not all failures of the selected pickup point.
export function ozonCheckoutError(
  rawCode: unknown,
  goodsAmount: number,
): string {
  const code = typeof rawCode === "string" ? rawCode : "unknown";
  if (code === "delivery_calculation_error")
    return goodsAmount < 100
      ? "Ozon не смог рассчитать доставку заказа с такой низкой стоимостью товаров. Добавьте изделие в корзину или свяжитесь со студией. Смена пункта может не помочь."
      : "Ozon не смог рассчитать стоимость доставки. Повторите расчёт; если ошибка сохраняется, свяжитесь со студией.";
  return "Ozon не подтвердил доставку этого заказа. Повторите расчёт или выберите другой пункт. Если ошибка сохраняется, свяжитесь со студией.";
}

export class DeliveryCheckoutError extends Error {
  constructor(public diagnosticCode: string, message: string) { super(message); }
}
export function deliveryDiagnostic(error: unknown) {
  if (error instanceof DeliveryCheckoutError) return error.diagnosticCode;
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; status?: unknown; reason?: unknown };
    if (typeof e.code === "string" && /^[A-Z0-9_]{1,60}$/.test(e.code)) return `DELIVERY_${e.code}`;
    if (typeof e.status === "number") return `DELIVERY_HTTP_${e.status}`;
  }
  const message = error instanceof Error ? error.message : "";
  if (/упаков/i.test(message)) return "PACKING_UNAVAILABLE";
  if (/сохранить расчёт/i.test(message)) return "QUOTE_SAVE_FAILED";
  if (/телефон/i.test(message)) return "PHONE_INVALID";
  if (/расчёт.*устарел/i.test(message)) return "DELIVERY_EXPIRED";
  return "DELIVERY_UNAVAILABLE";
}
