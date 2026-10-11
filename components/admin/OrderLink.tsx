"use client";
import { useState, useTransition } from "react";
import { prepareOrderLink } from "@/lib/actions/order-access";
export default function OrderLink({
  orderId,
  email,
  orderNumber,
}: {
  orderId: string;
  email: string | null;
  orderNumber: string;
}) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const prepare = (rotate: boolean) =>
    start(async () => {
      const result = await prepareOrderLink(orderId, rotate);
      if (result.error || !result.url) {
        setMessage(result.error || "Не удалось подготовить ссылку");
        return;
      }
      setUrl(result.url);
      setMessage(
        rotate
          ? "Новая ссылка готова. Старая больше не открывает заказ."
          : "Ссылка готова",
      );
    });
  return (
    <section className="admin-card space-y-3">
      <h3 className="text-lg">Страница заказа для покупателя</h3>
      <p className="text-sm text-stone-600">
        Персональная ссылка открывает состав и статус без регистрации.
        Отправляйте её только покупателю.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="admin-button"
          disabled={pending}
          onClick={() => prepare(false)}
        >
          Получить ссылку
        </button>
        <button
          type="button"
          className="admin-button"
          disabled={pending}
          onClick={() => {
            if (
              window.confirm(
                "Заменить ссылку? Старая ссылка покупателя перестанет работать.",
              )
            )
              prepare(true);
          }}
        >
          Заменить ссылку
        </button>
      </div>
      {url && (
        <>
          <input
            aria-label="Персональная ссылка на заказ"
            className="admin-input"
            value={url}
            readOnly
            onFocus={(event) => event.target.select()}
          />
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              className="underline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setMessage("Ссылка скопирована");
                } catch {
                  setMessage("Выделите и скопируйте ссылку выше");
                }
              }}
            >
              Скопировать
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Открыть страницу
            </a>
            {email && (
              <a
                className="underline"
                href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Roota — ваш заказ ${orderNumber}`)}&body=${encodeURIComponent(`Здравствуйте!\n\nСостав и статус вашего заказа доступны по персональной ссылке:\n${url}\n\nRoota ceramics`)}`}
              >
                Подготовить письмо покупателю
              </a>
            )}
          </div>
        </>
      )}
      <p className="text-sm text-stone-600">
        Автоматическая отправка писем пока не подключена. Кнопка письма
        открывает черновик в вашей почте.
      </p>
      <p role="status">{message}</p>
    </section>
  );
}
