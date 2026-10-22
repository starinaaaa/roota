// https://seller-edu.ozon.ru/libra/ozon-logistika/dostavka-dlya-biznesa/rabota-s-zakazami
export function ozonTrackingHint(shipmentCreated: boolean) {
  return shipmentCreated
    ? "В приложении Ozon откройте «Ozon Доставка» → «Заказы» → «Получения». Отправление появится там после перехода в статус «Готов к отправке». Войдите с номером телефона, указанным в заказе."
    : "Отправление ещё не оформлено в Ozon. После оформления и перехода в статус «Готов к отправке» оно появится в приложении: «Ozon Доставка» → «Заказы» → «Получения». Войдите с номером телефона, указанным в заказе.";
}
