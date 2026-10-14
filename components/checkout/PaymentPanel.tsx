"use client";
import { bindPrepositions } from "@/lib/typography";
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
  initialExpired?: boolean;
  requiresReview?: boolean;
  expiresAt?: string | null;
  orderUrl?: string;
  summary?: {
    number: string;
    amount: string;
    items: { name: string; quantity: number; sum: number; kind: string }[];
  };
  statusUrl?: string;
  returnPaymentUrl?: string;
};
declare global {
  interface Window {
    Robokassa?: {
      Render?: (fields: Record<string, string | string[]>) => void;
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
  initialExpired = false,
  requiresReview = false,
  expiresAt,
  orderUrl,
  summary,
  statusUrl,
  returnPaymentUrl,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [expired, setExpired] = useState(initialExpired);
  const [review, setReview] = useState(requiresReview);
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
        const response = await fetch(statusUrl ?? `/api/payments/${id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("STATUS_UNAVAILABLE");
        const result = await response.json();
        if (active) {
          setStatus(result.status);
          setExpired(result.expired);
          setReview(result.requiresReview);
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
  }, [id, status, statusUrl]);
  function openPayment() {
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
      setExpired(true);
      return;
    }
    if (!window.Robokassa || !ready) {
      setUnavailable(true);
      return;
    }
    try {
      if (window.Robokassa.Render) {
        window.Robokassa.Render({
          ...form!.fields,
          Settings: JSON.stringify({
            Mode: "modal",
          }),
        });
      } else {
        window.Robokassa.StartPayment(form!.fields);
      }
      setOpened(true);
    } catch {
      setUnavailable(true);
    }
  }
  const paid = status === "paid";
  return (
    <div className="pt-24 md:pt-32 min-h-screen">
      {form && !paid && !expired && (
        <Script
          id="robokassa-iframe"
          src="https://auth.robokassa.ru/Merchant/bundle/robokassa_iframe.js"
          strategy="afterInteractive"
          onReady={() => setReady(true)}
          onError={() => setUnavailable(true)}
        />
      )}
      <div className="max-w-6xl w-full mx-auto px-5 md:px-12 py-12 md:py-20 grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-10 lg:gap-20 items-start">
        <div className="min-w-0 space-y-6">
          {mode === "test" && (
            <p className="font-body text-caption text-stone-600">
              Тестовая оплата · деньги не списываются · заказ не отправляется
            </p>
          )}
          <h1
            className="font-display text-[clamp(2rem,4vw,3.5rem)] leading-[1.12] text-stone-900 [overflow-wrap:normal] [word-break:normal] [hyphens:none]"
            aria-live="polite"
          >
            {bindPrepositions(
              review
                ? "Оплата требует проверки"
                : expired
                  ? "Срок резерва истёк"
                  : paid
                    ? mode === "test"
                      ? "Тестовая оплата прошла"
                      : "Заказ оплачен"
                    : failed
                      ? "Оплата не завершена"
                      : form && !opened
                        ? "Оплата заказа"
                        : "Подтверждаем оплату",
            )}
          </h1>
          <p className="font-body text-copy text-stone-800 leading-relaxed">
            {bindPrepositions(
              review
                ? "Оплата получена после отмены заказа. Свяжитесь со студией: нужно согласовать наличие изделия или возврат оплаты."
                : expired
                  ? "Срок резерва истёк. Чтобы продолжить покупку, оформите новый заказ и проверьте наличие. Если вы уже оплатили, свяжитесь со студией."
                  : paid
                    ? mode === "test"
                      ? "Платёжный сценарий проверен. Это тест, доставка не запускается."
                      : "Спасибо за покупку! Начинаем готовить ваш заказ. Состав, доставка и актуальный статус доступны на странице заказа."
                    : "Статус обновится после подтверждения Robokassa. Если вы уже оплатили, повторять оплату не нужно.",
            )}
          </p>
          {form && !paid && !expired && (
            <p className="font-body text-ui text-stone-600">
              Доступные способы оплаты появятся в защищённой форме Robokassa.
            </p>
          )}
          {expiresAt && !paid && !expired && (
            <p className="font-body text-ui text-stone-600">
              Резерв на 30 минут — до{" "}
              {new Date(expiresAt).toLocaleTimeString("ru-RU", {
                timeZone: "Europe/Moscow",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              (МСК).
            </p>
          )}
          {checkFailed && (
            <p role="status" className="font-body text-ui text-stone-600">
              Не удалось обновить статус. Проверим ещё раз автоматически.
            </p>
          )}
          {form && !paid && !expired && (
            <>
              <button
                type="button"
                onClick={openPayment}
                disabled={!ready || unavailable}
                className="w-full bg-stone-900 text-stone-50 font-body text-ui tracking-[0.08em] uppercase py-4 disabled:opacity-50"
              >
                Перейти к оплате
              </button>
              {unavailable && (
                <p role="status" className="font-body text-ui text-stone-600">
                  Встроенная форма недоступна. Откройте страницу оплаты
                  по кнопке ниже.
                </p>
              )}
              <form
                onSubmit={(event) => {
                  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
                    event.preventDefault();
                    setExpired(true);
                  }
                }}
                action={form.action}
                method="POST"
              >
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
                  Перейти на страницу Robokassa
                </button>
              </form>
            </>
          )}
          {!form && !paid && !expired && (
            <Link
              href={returnPaymentUrl ?? `/payment/${id}`}
              className="block font-body text-ui underline underline-offset-4"
            >
              Вернуться к оплате заказа
            </Link>
          )}
          {orderUrl && (
            <Link
              href={orderUrl}
              prefetch={false}
              className="block border border-stone-300 px-6 py-4 text-center font-body text-ui"
            >
              Открыть мой заказ
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
        {summary && (
          <aside
            className="bg-white border border-stone-200 p-6 md:p-8 font-body text-ui"
            aria-label="Состав и сумма заказа"
          >
            <p className="text-caption uppercase tracking-widest text-stone-500 mb-2">
              Ваш заказ
            </p>
            <h2 className="font-display text-price mb-6 [overflow-wrap:normal]">
              № {summary.number}
            </h2>
            <ul className="divide-y divide-stone-100">
              {summary.items
                .filter((item) => item.kind === "goods")
                .map((item, index) => (
                  <li key={index} className="flex justify-between gap-4 py-4">
                    <span className="min-w-0">
                      {item.name}
                      <span className="block text-caption text-stone-500">
                        {item.quantity} шт.
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap">
                      {money(item.sum)}
                    </span>
                  </li>
                ))}
            </ul>
            <div className="flex justify-between gap-4 border-t border-stone-200 py-5">
              <span>Доставка</span>
              <span className="shrink-0 whitespace-nowrap">
                {money(
                  summary.items
                    .filter((item) => item.kind !== "goods")
                    .reduce((sum, item) => sum + Number(item.sum), 0),
                )}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-t border-stone-200 pt-5 text-price">
              <span>{paid ? "Оплачено" : "К оплате"}</span>
              <span className="whitespace-nowrap">
                {money(Number(summary.amount))}
              </span>
            </div>
            <p className="text-caption text-stone-500 mt-5">
              {paid
                ? "Чек об оплате направляет Robokassa на email, указанный при оформлении."
                : "Доставка уже включена в итоговую сумму."}
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

function money(amount: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(amount);
}
