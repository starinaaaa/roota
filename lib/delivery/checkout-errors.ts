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
