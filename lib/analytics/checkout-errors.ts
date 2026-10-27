export const checkoutErrorFields = [
  "name",
  "firstName",
  "lastName",
  "phone",
  "email",
  "telegram",
  "contactValue",
  "contactChannel",
  "address",
  "acceptedTerms",
  "newsletterDataConsent",
  "deliveryQuoteId",
  "cart",
  "order",
  "payment",
] as const;
export type CheckoutErrorField = (typeof checkoutErrorFields)[number];
export function checkoutIssue(issue: {
  path: readonly PropertyKey[];
  code: string;
  params?: { diagnosticCode?: string };
}) {
  const raw = String(issue.path[0] ?? "order");
  const field = (checkoutErrorFields as readonly string[]).includes(raw)
    ? (raw as CheckoutErrorField)
    : "order";
  return {
    field,
    code:
      issue.params?.diagnosticCode ??
      `${field.replace(/[A-Z]/g, (x) => `_${x}`).toUpperCase()}_INVALID`,
  };
}
export const checkoutFieldLabels: Record<CheckoutErrorField, string> = {
  name: "Имя и фамилия",
  firstName: "Имя",
  lastName: "Фамилия",
  phone: "Телефон",
  email: "Email",
  telegram: "Telegram",
  contactValue: "Контакт для курьера",
  contactChannel: "Канал связи",
  address: "Адрес доставки",
  acceptedTerms: "Условия покупки",
  newsletterDataConsent: "Согласие на подписку",
  deliveryQuoteId: "Расчёт доставки",
  cart: "Корзина",
  order: "Сохранение заказа",
  payment: "Подготовка оплаты",
};

export const checkoutCodeLabels: Record<string, string> = {
  ADDRESS_REQUIRED: "Не заполнен адрес доставки",
  ADDRESS_INCOMPLETE: "Адрес неполный",
  DELIVERY_EXPIRED: "Расчёт доставки устарел",
  QUOTE_REQUIRED: "Не выбран пункт или нет расчёта",
  RECIPIENT_REJECTED: "Ozon отказал в доставке по телефону получателя",
  SAVE_FAILED: "Не удалось сохранить заказ",
  SAVE_OR_PAYMENT_FAILED: "Сбой сохранения или подготовки оплаты",
  OUT_OF_STOCK: "Наличие изменилось",
  PRICE_CHANGED: "Цена изменилась",
  NETWORK_ERROR: "Нет соединения",
  QUOTE_SAVE_FAILED: "Не удалось сохранить расчёт доставки",
};
