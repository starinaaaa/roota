"use client";
import { useActionState } from "react";
import { reviewReturnRequest } from "@/lib/actions/return-requests-admin";
import { requestStatuses } from "@/lib/delivery/return-model";
export default function ReturnRequestReview({
  id,
  status,
  reply,
}: {
  id: string;
  status: string;
  reply: string;
}) {
  const [state, action, pending] = useActionState(reviewReturnRequest, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        Статус заявки
        <select
          name="status"
          defaultValue={status}
          className="admin-input block mt-1"
        >
          {Object.entries(requestStatuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Ответ покупателю на странице заказа
        <textarea
          name="reply"
          defaultValue={reply}
          maxLength={4000}
          rows={3}
          className="admin-input block w-full mt-1"
        />
      </label>
      <p className="text-sm text-stone-600">
        Согласуйте решение и способ отправки с покупателем. Этот ответ не
        создаёт отправление и не возвращает оплату.
      </p>
      <button className="admin-button" disabled={pending}>
        {pending ? "Сохраняем…" : "Сохранить ответ"}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.saved && (
        <p role="status">
          Ответ сохранён и доступен покупателю на странице заказа.
        </p>
      )}
    </form>
  );
}
