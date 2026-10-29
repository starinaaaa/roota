"use client";
import { useActionState } from "react";
import { submitReturnRequest } from "@/lib/actions/customer-returns";
import { returnReasons } from "@/lib/delivery/return-model";
export default function ReturnRequestForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(submitReturnRequest, {});
  if (state.saved)
    return (
      <p role="status">
        Заявка получена. Студия рассмотрит её и свяжется с вами. Не отправляйте
        изделие обратно до согласования.
      </p>
    );
  return (
    <details className="border-t border-stone-200 pt-6">
      <summary className="cursor-pointer">
        Обратиться по поводу возврата
      </summary>
      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="token" value={token} />
        <p>
          Укажите, какое изделие хотите вернуть и что произошло. Студия
          рассмотрит заявку и согласует с вами решение. Обратную отправку
          оформляем после согласования.
        </p>
        <label className="block">
          Причина
          <select
            name="reason"
            required
            className="block w-full border border-stone-300 bg-white p-3 mt-2"
          >
            {Object.entries(returnReasons).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Описание
          <textarea
            name="description"
            required
            minLength={10}
            maxLength={4000}
            rows={4}
            className="block w-full border border-stone-300 p-3 mt-2"
          />
        </label>
        <label className="block">
          Фотографии изделия и упаковки
          <input
            type="file"
            name="photos"
            multiple
            accept="image/jpeg,image/png,image/webp"
            aria-describedby="return-photo-help"
            className="block w-full mt-2"
          />
        </label>
        <p id="return-photo-help" className="text-caption text-stone-600">
          До 3 фотографий JPEG, PNG или WebP, по 3 МБ. При повреждении или
          получении другого изделия приложите хотя бы одно фото. Материалы
          доступны только студии.
        </p>
        {state.error && <p role="alert">{state.error}</p>}
        <button
          disabled={pending}
          className="border border-stone-900 px-5 py-3 disabled:opacity-50"
        >
          {pending ? "Отправляем…" : "Отправить заявку"}
        </button>
      </form>
    </details>
  );
}
