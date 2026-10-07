"use client";
import Script from "next/script";
import Link from "next/link";
import { useEffect, useState } from "react";

type PaymentForm = {
  action: string;
  method: "POST";
  fields: Record<string, string | string[]>;
};
type Props = {
  id: string;
  mode: "test" | "live";
  initialStatus: "pending" | "paid";
  form?: PaymentForm;
  failed?: boolean;
};
declare global {
  interface Window {
    Robokassa?: {
      StartPayment: (fields: Record<string, string | string[]>) => void;
    };
  }
}

export default function PaymentPanel({
  id,
  mode,
  initialStatus,
  form,
  failed,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [ready, setReady] = useState(false);
  const [opened, setOpened] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  useEffect(() => {
    if (status === "paid") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function check() {
      try {
        const response = await fetch(`/api/payments/${id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("STATUS_UNAVAILABLE");
        const result = await response.json();
        if (active) {
          setStatus(result.status);
          setCheckFailed(false);
        }
        if (result.status === "paid") return;
      } catch {
        if (active) setCheckFailed(true);
      }
      if (active) timer = setTimeout(check, 4000);
    }
    void check();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, status]);
  function openPayment() {
    if (!window.Robokassa || !ready) {
      setUnavailable(true);
      return;
    }
    try {
      window.Robokassa.StartPayment(form!.fields);
      setOpened(true);
    } catch {
      setUnavailable(true);
    }
  }
  const paid = status === "paid";
  return (
    <div className="pt-16 md:pt-20 min-h-screen flex items-center">
      {form && !paid && (
        <Script
          id="robokassa-iframe"
          src="https://auth.robokassa.ru/Merchant/bundle/robokassa_iframe.js"
          strategy="afterInteractive"
          onReady={() => setReady(true)}
          onError={() => setUnavailable(true)}
        />
      )}
      <div className="max-w-[1440px] w-full mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-32">
        <div className="max-w-md space-y-6">
          {mode === "test" && (
            <p className="font-body text-caption text-stone-600">
              Тестовая оплата · деньги не списываются · заказ не отправляется
            </p>
          )}
          <h1
            className="font-display text-page leading-tight text-stone-900"
            aria-live="polite"
          >
            {paid
              ? mode === "test"
                ? "Тестовая оплата прошла"
                : "Заказ оплачен"
              : failed
                ? "Оплата не завершена"
                : form && !opened
                  ? "Оплата заказа"
                  : "Ожидаем подтверждение"}
          </h1>
          <p className="font-body text-copy text-stone-800 leading-relaxed">
            {paid
              ? mode === "test"
                ? "Платёжный сценарий проверен. Это тест, доставка не запускается."
                : "Спасибо! Мы свяжемся с вами для подготовки заказа."
              : "Статус обновится после подтверждения Robokassa. Если вы уже оплатили, повторять оплату не нужно."}
          </p>
          {checkFailed && (
            <p role="status" className="font-body text-ui text-stone-600">
              Не удалось обновить статус. Проверим ещё раз автоматически.
            </p>
          )}
          {form && !paid && (
            <>
              <button
                type="button"
                onClick={openPayment}
                disabled={!ready || unavailable}
                className="w-full bg-stone-900 text-stone-50 font-body text-ui tracking-[0.08em] uppercase py-4 disabled:opacity-50"
              >
                Оплатить
              </button>
              {unavailable && (
                <p role="status" className="font-body text-ui text-stone-600">
                  Встроенная форма недоступна. Откройте страницу оплаты по
                  кнопке ниже.
                </p>
              )}
              <form action={form.action} method="POST">
                {Object.entries(form.fields).flatMap(([name, values]) =>
                  (Array.isArray(values) ? values : [values]).map(
                    (value, index) => (
                      <input
                        key={`${name}-${index}`}
                        type="hidden"
                        name={name}
                        value={value}
                      />
                    ),
                  ),
                )}
                <button
                  type="submit"
                  className="w-full border border-stone-300 text-stone-700 font-body text-ui py-4"
                >
                  Перейти на страницу Robokassa
                </button>
              </form>
            </>
          )}
          {!form && !paid && (
            <Link
              href={`/payment/${id}`}
              className="block font-body text-ui underline underline-offset-4"
            >
              Вернуться к оплате заказа
            </Link>
          )}
          <Link
            href="/catalog"
            className="block font-body text-ui text-stone-600 underline underline-offset-4"
            target="_top"
          >
            Продолжить покупки
          </Link>
        </div>
      </div>
    </div>
  );
}
