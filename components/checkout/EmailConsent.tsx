"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { syncCheckoutEmailConsent } from "@/lib/actions/email";

export default function EmailConsent({
  email,
  serviceConsent,
  marketingConsent,
  onChange,
}: {
  email: string;
  serviceConsent: boolean;
  marketingConsent: boolean;
  onChange: (marketingConsent: boolean) => void;
}) {
  const [error, setError] = useState("");
  useEffect(() => {
    if ((serviceConsent || marketingConsent) && !email) return;
    let current = true;
    const timer = setTimeout(() => {
      void syncCheckoutEmailConsent(email, { serviceConsent, marketingConsent })
        .then((result) => {
          if (current) setError(result.error ?? "");
        })
        .catch(() => {
          if (current)
            setError(
              "Не удалось сохранить настройки писем. Попробуйте ещё раз.",
            );
        });
    }, 800);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [email, serviceConsent, marketingConsent]);
  const linkClass = "underline underline-offset-4 hover:text-stone-900";
  return (
    <div className="font-body text-caption leading-relaxed text-stone-600 space-y-3">
      <div className="flex items-start gap-3">
        <input
          id="subscribeToNews"
          type="checkbox"
          name="subscribeToNews"
          form="checkout-form"
          checked={marketingConsent}
          onChange={(e) => {
            setError("");
            onChange(e.target.checked);
          }}
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
            рекламную рассылку
          </Link>{" "}
          и даю{" "}
          <Link
            href="/newsletter-data-consent"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            согласие на обработку email
          </Link>
          .
        </label>
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
