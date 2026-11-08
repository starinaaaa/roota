export const marketPreviewScreens = {
  display: "iPad · знакомство и QR",
  "display-payment": "iPad · покупка и QR оплаты",
  email: "Телефон · покупка и ввод почты",
  buy: "Телефон · сумма, почта и способ оплаты",
  transfer: "Телефон · перевод по номеру телефона",
  cash: "Телефон · наличные",
  returning: "Телефон · проверка после Робокассы",
  paid: "Телефон · оплачено, чек готовится",
  receipt: "Телефон · оплачено, чек готов",
  "paid-email": "Телефон · оплачено, оставить почту для чека",
  review: "Телефон · форма отзыва",
  "review-saved": "Телефон · отзыв сохранён и промокод",
  expired: "Телефон · закрытая покупка",
  "receipt-document": "Пример документа (демо)",
} as const;
export type MarketPreviewScreen = keyof typeof marketPreviewScreens;
