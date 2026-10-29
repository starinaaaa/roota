export const OZON_TRACKING_URL = "https://www.ozon.ru/delivery?miniapp=cml";

// https://seller-edu.ozon.ru/libra/ozon-logistika/dostavka-dlya-biznesa/rabota-s-zakazami
export function ozonTrackingHint(shipmentCreated: boolean) {
  return shipmentCreated
    ? "Откройте «Заказы» → «Получения». Отправление появится там после перехода в статус «Готов к отправке». Войдите с номером телефона, указанным в заказе."
    : "Отправление ещё не оформлено в Ozon. Откройте «Заказы» → «Получения». Отправление появится там после перехода в статус «Готов к отправке». Войдите с номером телефона, указанным в заказе.";
}
