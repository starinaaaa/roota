"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { syncCheckoutEmailConsent } from "@/lib/actions/email";

export default function EmailConsent({
  email,
  dataConsent,
  marketingConsent,
  onChange,
}: {
  email: string;
  dataConsent: boolean;
  marketingConsent: boolean;
  onChange: (dataConsent: boolean, marketingConsent: boolean) => void;
}) {
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const enabled = dataConsent && marketingConsent;
  useEffect(() => {
    if (!touched || (enabled && !email)) return;
    let current = true;
    const timer = setTimeout(() => {
      void syncCheckoutEmailConsent(email, { dataConsent, marketingConsent })
        .then((result) => {
          if (current) setError(result.error ?? "");
        })
        .catch(() => {
          if (current)
            setError("Не удалось сохранить согласие. Попробуйте ещё раз.");
        });
    }, 800);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [email, enabled, dataConsent, marketingConsent, touched]);
  function change(data: boolean, marketing: boolean) {
    setTouched(true);
    setError("");
    onChange(data, marketing);
  }
  const linkClass = "underline underline-offset-4 hover:text-stone-900";
  return (
    <div className="font-body text-caption leading-relaxed text-stone-600 space-y-3">
      <p>Письма Roota — по желанию. Можно оформить заказ без подписки.</p>
      <div className="flex items-start gap-3">
        <input
          id="newsletterDataConsent"
          type="checkbox"
          name="newsletterDataConsent"
          form="checkout-form"
          checked={dataConsent}
          onChange={(e) =>
            change(e.target.checked, e.target.checked && marketingConsent)
          }
          className="mt-1 h-4 w-4 shrink-0 accent-stone-900"
        />
        <label htmlFor="newsletterDataConsent" className="cursor-pointer">
          Даю отдельное{" "}
          <Link
            href="/newsletter-data-consent"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            согласие на обработку email для подписки
          </Link>
          .
        </label>
      </div>
      <div className="flex items-start gap-3">
        <input
          id="subscribeToNews"
          type="checkbox"
          name="subscribeToNews"
          form="checkout-form"
          checked={marketingConsent}
          onChange={(e) => change(dataConsent, e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-stone-900"
        />
        <label htmlFor="subscribeToNews" className="cursor-pointer">
          Согласен получать{" "}
          <Link
            href="/newsletter-consent"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            новости, напоминания о корзине и приглашения оставить отзыв
          </Link>
          .
        </label>
      </div>
      {marketingConsent && !dataConsent && (
        <p role="status">
          Для подписки также нужно согласие на обработку email. Покупка доступна
          без подписки.
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
