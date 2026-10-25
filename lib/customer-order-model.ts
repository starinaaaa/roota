export const orderSteps = [
  "Оформлен",
  "Оплачен",
  "Готовится к отправке",
  "В пути",
  "Можно забирать",
  "Получен",
];
export type DeliveryStage =
  | "preparing"
  | "shipped"
  | "in_transit"
  | "ready_for_pickup"
  | "delivered"
  | "returning"
  | "returned"
  | "problem"
  | "cancelled";

export function customerOrderState(order: {
  status: string;
  payment_status: string;
  delivery_stage?: string | null;
  leadTimeDays?: number;
  hasPreorder?: boolean;
  parcelStatuses?: (string | null)[];
}) {
  if (order.status === "cancelled")
    return {
      title:
        order.payment_status === "paid"
          ? "Оплата требует проверки"
          : "Заказ отменён",
      step: -1,
      detail:
        order.payment_status === "paid"
          ? "Оплата получена после отмены заказа. Напишите нам: согласуем наличие изделия или возврат."
          : "Заказ отменён, резерв снят. Для покупки оформите новый заказ. Если уже оплатили — напишите нам.",
    };
  if (order.payment_status === "refunded")
    return {
      title: "Оплата возвращена",
      step: -1,
      detail: "Возврат оплаты оформлен. Если остались вопросы, напишите нам.",
    };
  if (
    order.delivery_stage === "returning" ||
    order.delivery_stage === "returned"
  )
    return {
      title:
        order.delivery_stage === "returned"
          ? "Посылка возвращена"
          : "Посылка возвращается",
      step: -1,
      detail: "Напишите нам, чтобы согласовать дальнейшие действия.",
    };
  if (
    order.delivery_stage === "problem" ||
    order.delivery_stage === "cancelled"
  )
    return {
      title: "Уточняем доставку",
      step: -1,
      detail:
        "С доставкой возникла проблема. Напишите нам — поможем разобраться.",
    };
  if (order.status === "delivered" || order.delivery_stage === "delivered")
    return {
      title: "Заказ получен",
      step: 5,
      detail:
        "Спасибо, что выбираете Roota ceramics. Надеемся, изделие будет радовать вас долго.",
    };
  if (
    order.payment_status === "paid" &&
    (order.parcelStatuses?.length ?? 0) > 1
  ) {
    const statuses = order.parcelStatuses!;
    const received = statuses.filter((status) => status === "delivered").length;
    const ready = statuses.filter(
      (status) => status === "in_delivery_point",
    ).length;
    if (ready || received)
      return {
        title: ready
          ? `Можно забрать ${ready} из ${statuses.length} посылок`
          : `Получено ${received} из ${statuses.length} посылок`,
        step: ready ? 4 : 3,
        detail: `Получено: ${received} из ${statuses.length}. Посылки могут приехать в разные дни. Статус каждой — ниже.`,
      };
    const moving = statuses.filter((status) =>
      ["on_way", "in_courier_service"].includes(status ?? ""),
    ).length;
    if (moving && moving < statuses.length)
      return {
        title: "Часть заказа в пути",
        step: 3,
        detail: `В пути: ${moving} из ${statuses.length} посылок. Статус и состав каждой — ниже.`,
      };
  }
  if (order.delivery_stage === "ready_for_pickup")
    return {
      title: "Можно забирать",
      step: 4,
      detail:
        "Посылка поступила в пункт выдачи. Проверьте срок хранения в Ozon перед получением.",
    };
  if (order.delivery_stage === "in_transit")
    return {
      title: "Заказ в пути",
      step: 3,
      detail:
        "Посылка направляется в ваш пункт выдачи. Здесь появится информация о её прибытии.",
    };
  if (order.status === "shipped" || order.delivery_stage === "shipped")
    return {
      title: "Заказ отправлен",
      step: 3,
      detail: "Посылка передана службе доставки.",
    };
  if (order.payment_status !== "paid")
    return {
      title: "Ожидаем оплату",
      step: 0,
      detail:
        "Заказ оформлен. После подтверждения оплаты начнём его подготовку.",
    };
  const detail = order.leadTimeDays
    ? `Изготовление — до ${order.leadTimeDays} дней после оплаты. После готовности передадим заказ в доставку.`
    : order.hasPreorder
      ? "Оплата получена. Срок изготовления предзаказа уточним лично."
      : "Оплата получена. Отправим в течение 1–3 рабочих дней.";
  return {
    title:
      order.status === "confirmed" || order.status === "in_production"
        ? "Готовится к отправке"
        : "Заказ оплачен",
    step: order.status === "new" ? 1 : 2,
    detail,
  };
}
