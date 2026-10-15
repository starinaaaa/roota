// Server transport. Keep token-bearing URLs and raw provider errors out of logs.
export function orderNotificationText(
  order: {
    order_number: string;
    total_amount: number;
    status: string;
    payment_status: string;
  },
  event: "created" | "paid" = "created",
) {
  const cancelledPaid =
    order.status === "cancelled" && order.payment_status === "paid";
  const title = cancelledPaid
    ? "Оплата отменённого заказа"
    : event === "paid"
      ? "Заказ оплачен"
      : "Новый заказ";
  const payment =
    order.payment_status === "paid" ? "Оплачен" : "Ожидает оплаты";
  return `${title} ${order.order_number}\nСумма заказа: ${order.total_amount} ₽\n${payment}\n${cancelledPaid ? "Проверьте наличие или согласуйте возврат. Отправка не запускается." : "Откройте админку студии для деталей."}\nhttps://roota.moscow/admin`;
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  request: typeof fetch = fetch,
  relay?: {
    url: string;
    serviceKey: string;
    protocol?: "fixed-chat";
    idempotencyKey?: string;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const response = await request(
      relay
        ? relay.url
        : `https://api.telegram.org/bot${token.trim()}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(relay ? { Authorization: `Bearer ${relay.serviceKey}` } : {}),
        },
        body: JSON.stringify(
          relay
            ? relay.protocol === "fixed-chat"
              ? { text, key: relay.idempotencyKey }
              : { token: token.trim(), chatId: chatId.trim(), text }
            : { chat_id: chatId.trim(), text },
        ),
        signal: AbortSignal.timeout(relay ? 25000 : 15000),
        cache: "no-store",
      },
    );
    const result = await response.json();
    return response.ok && result.ok === true
      ? { ok: true }
      : {
          ok: false,
          reason: `provider_${Number(result.error_code) || response.status}`,
        };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error && /Timeout|Abort/.test(error.name)
          ? "timeout"
          : "network",
    };
  }
}
