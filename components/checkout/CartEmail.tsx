"use client";
import { useState, useTransition } from "react";
import { requestCartEmail } from "@/lib/actions/email";
export default function CartEmail({ email }: { email: string }) {
  const [consent, setConsent] = useState(false),
    [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 text-caption text-stone-600">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        Прислать ссылку на корзину и напомнить, если я не завершу покупку.
        Согласен на обработку email для этого сообщения и напоминания.
        Отписаться можно в письме.
      </label>
      <p>
        Подписка включится после подтверждения email.{" "}
        <a href="/privacy" className="underline">
          Политика конфиденциальности
        </a>
      </p>
      <button
        type="button"
        className="admin-secondary"
        disabled={pending || !consent || !email}
        onClick={() =>
          start(async () => {
            try {
              const result = await requestCartEmail(email, consent);
              setMessage(
                result.error ?? "Проверьте почту и подтвердите адрес.",
              );
            } catch {
              setMessage("Не удалось сохранить корзину. Попробуйте позже.");
            }
          })
        }
      >
        {pending ? "Сохраняю…" : "Получить ссылку по почте"}
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
