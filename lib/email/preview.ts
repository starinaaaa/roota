import { deliveryEmailUpdate } from "@/lib/delivery/customer-parcels";
import { ozonTrackingHint } from "@/lib/delivery/tracking";
import { LEGAL_VERSION } from "@/lib/legal";
import { reviewInvitation } from "@/lib/review-copy";
import {
  renderEmail,
  type TemplateKind,
  type EmailOrderItem,
} from "./templates";

export const reviewPreviewVariants = [
  { id: "plate", label: "Одна тарелка" },
  { id: "plates", label: "Несколько тарелок" },
  { id: "garden", label: "Конструктор «Сад»" },
  { id: "mixed", label: "Смешанный заказ" },
] as const;
export type ReviewPreviewVariant = (typeof reviewPreviewVariants)[number]["id"];
export const emailKindLabels: Record<TemplateKind, string> = {
  order_created: "Заказ оформлен",
  order_paid: "Оплата получена",
  order_shipped: "Посылка отправлена",
  order_pickup: "Посылку можно забирать",
  order_delivered: "Заказ получен",
  review_invite: "Приглашение оставить отзыв",
  order_review_reward: "Персональный промокод за отзыв",
  cart_reminder: "Напоминание о корзине",
  restock: "Изделие снова в наличии",
  confirm: "Подтверждение email",
  cart_link: "Ссылка на корзину",
  collection: "Письмо о коллекции",
};

export function renderEmailPreview(
  template: { kind: string; subject: string; body: string },
  variant: ReviewPreviewVariant = "plate",
) {
  const plate = {
    name: "Тарелка «Солнышко»",
    quantity: variant === "plates" ? 3 : 1,
    price: 3500,
  };
  const garden = {
    name: "Керамический конструктор «Сад»",
    quantity: 1,
    price: 2000,
  };
  const items: EmailOrderItem[] =
    variant === "garden"
      ? [garden]
      : variant === "mixed"
        ? [plate, garden]
        : [plate];
  const invitation = reviewInvitation(
    items.map((i) => ({ product_name: i.name, quantity: i.quantity })),
  );
  const number = "GL-ПРИМЕР";
  const values = {
    legal_version: LEGAL_VERSION,
    number,
    total: new Intl.NumberFormat("ru-RU").format(
      items.reduce((sum, i) => sum + i.quantity * i.price, 350),
    ),
    items: items
      .map((i) => `${i.name} × ${i.quantity} — ${i.price * i.quantity} ₽`)
      .join("\n"),
    reservation: "Резерв до 29 октября 2026, 19:00 МСК",
    product: items[0].name,
    date: "29 октября 2026, 18:30 МСК",
    shipping: "350 ₽",
    payment: "Оплачено · пример",
    recipient: "Покупатель Roota",
    delivery: "Пункт выдачи Ozon",
    address: "Москва, пример адреса пункта выдачи",
    tracking: "Пример номера отправления",
    delivery_subject: deliveryEmailUpdate(template.kind, number, []).subject,
    delivery_update: deliveryEmailUpdate(template.kind, number, []).message,
    tracking_hint: ozonTrackingHint(false),
    fulfillment:
      "Готовые изделия передаём в доставку в течение 1–3 рабочих дней после оплаты.",
    purpose: "уведомление о поступлении изделия",
    review_subject: invitation.subject,
    review_body: invitation.body,
    promo_code: "ROOTA-0123456789AB",
    promo_expires: "28 ноября 2026, 18:30 МСК",
  };
  const review = template.kind === "review_invite";
  const reward = template.kind === "order_review_reward";
  const orderMessage = template.kind.startsWith("order_") && !reward;
  const url = review
    ? "https://roota.moscow/review/preview"
    : reward
      ? "https://roota.moscow/catalog"
      : orderMessage
        ? "https://roota.moscow/order/preview"
        : "https://roota.moscow";
  return renderEmail(
    template,
    values,
    url,
    review
      ? "Оставить отзыв"
      : reward
        ? "Выбрать изделия"
        : orderMessage
          ? "Открыть заказ"
          : "Открыть Roota",
    orderMessage || reward ? undefined : "https://roota.moscow/email/preview",
    orderMessage,
    items,
    undefined,
  );
}
