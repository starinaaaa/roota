"use client";
import ActionStatus from "@/components/ui/ActionStatus";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveOrderReturn,
  requestOrderRefund,
  refreshOrderRefund,
  reconcileOrderRefund,
} from "@/lib/actions/returns";

export type ReturnData = {
  money_state: string;
  goods_state: string;
  notes: string;
  amount: number;
  provider_request_id: string | null;
};
export default function ReturnEditor({
  orderId,
  total,
  value,
  canRefund,
  configured,
}: {
  orderId: string;
  total: string;
  value: ReturnData | null;
  canRefund: boolean;
  configured: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const labels: Record<string, string> = {
    none: "Не запрошен",
    sending: "Запрос отправляется — перед повтором сверьте кабинет",
    processing: "Обрабатывается Robokassa",
    finished: "Деньги возвращены",
    rejected: "Заявка отклонена",
    unknown: "Нет подтверждения — требуется сверка в Robokassa",
    canceled: "Заявка отменена",
  };
  return (
    <section className="admin-card space-y-4">
      <h3 className="text-lg">Возврат денег и изделия</h3>
      <p>Деньги: {labels[value?.money_state ?? "none"]}</p>
      {value?.provider_request_id && (
        <p className="text-sm break-all">
          Заявка Robokassa: {value.provider_request_id}
        </p>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          start(async () => {
            try {
              await saveOrderReturn(form);
              setMessage("Возврат сохранён");
              router.refresh();
            } catch {
              setMessage(
                "Не удалось сохранить. Укажите причину от 5 до 2000 символов.",
              );
            }
          });
        }}
      >
        <input type="hidden" name="order_id" value={orderId} />
        <label className="block">
          Изделие
          <select
            className="admin-input"
            name="goods_state"
            defaultValue={value?.goods_state ?? "not_required"}
          >
            <option value="not_required">Возврат изделия не требуется</option>
            <option value="expected">Ожидаем изделие</option>
            <option value="received">Изделие получено студией</option>
          </select>
        </label>
        <label className="block">
          Причина и заметки по возврату
          <textarea
            name="notes"
            className="admin-input"
            required
            minLength={5}
            maxLength={2000}
            rows={3}
            defaultValue={value?.notes ?? ""}
          />
        </label>
        <button className="admin-secondary" disabled={pending}>
          Сохранить возврат
        </button>
      </form>
      <p className="text-sm text-stone-600">
        Доступен полный возврат платежа вместе с доставкой. Сначала сохраните
        причину. Возврат денег не отменяет заказ и не возвращает изделие на
        склад. После осмотра изделия проверьте остатки в карточке товара; для
        неотправленного заказа используйте отмену заказа.
      </p>
      {!configured && (
        <p className="text-sm">
          Для возврата из студии нужен ROBOKASSA_PASSWORD3 на сервере.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="admin-button"
          disabled={
            pending ||
            !configured ||
            !canRefund ||
            !value ||
            !["none", "rejected"].includes(value.money_state)
          }
          onClick={() => {
            if (
              !window.confirm(
                `Вернуть покупателю ${total} через Robokassa? Возврат включает доставку и не отменяет заказ.`,
              )
            )
              return;
            start(async () => {
              try {
                const r = await requestOrderRefund(orderId);
                setMessage(r.error ?? r.message ?? "");
                router.refresh();
              } catch {
                setMessage(
                  "Не удалось проверить возврат. Перед повтором сверьте кабинет Robokassa.",
                );
              }
            });
          }}
        >
          Вернуть {total}
        </button>
        {value?.provider_request_id && (
          <button
            type="button"
            className="admin-secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  const r = await refreshOrderRefund(orderId);
                  setMessage(r.error ?? r.message ?? "");
                  router.refresh();
                } catch {
                  setMessage("Не удалось обновить статус");
                }
              })
            }
          >
            Проверить возврат в Robokassa
          </button>
        )}
        <a
          className="admin-secondary"
          href="https://partner.robokassa.ru/Operation"
          target="_blank"
          rel="noopener noreferrer"
        >
          Кабинет Robokassa
        </a>
      </div>
      {value &&
        !value.provider_request_id &&
        value.money_state !== "finished" && (
          <details className="text-sm space-y-3">
            <summary className="cursor-pointer">
              Связать возврат из кабинета / после тайм-аута
            </summary>
            <p>
              API статуса не сообщает номер исходного платежа. Сверьте заказ и
              полную сумму в кабинете Robokassa, затем укажите ID заявки.
              Частичные возвраты здесь не подтверждаются.
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                start(async () => {
                  try {
                    const r = await reconcileOrderRefund(form);
                    setMessage(r.error ?? r.message ?? "");
                    router.refresh();
                  } catch {
                    setMessage(
                      "Проверьте ID заявки, комментарий и подтверждение сверки",
                    );
                  }
                });
              }}
            >
              <input type="hidden" name="order_id" value={orderId} />
              <label className="block">
                ID заявки Robokassa
                <input
                  className="admin-input"
                  name="request_id"
                  required
                  pattern="[a-fA-F0-9-]{36}"
                />
              </label>
              <label className="block">
                Основание сверки
                <input
                  className="admin-input"
                  name="note"
                  required
                  minLength={5}
                  maxLength={2000}
                />
              </label>
              <label className="flex gap-2">
                <input type="checkbox" name="verified" required />Я сверил, что
                заявка относится к этому заказу на полную сумму
              </label>
              <button className="admin-secondary" disabled={pending}>
                Связать и проверить
              </button>
            </form>
          </details>
        )}
      <ActionStatus
        message={message}
        pending={pending}
        pendingLabel="Проверяю…"
      />
    </section>
  );
}
