"use client";
import { useEffect, useState } from "react";
import { syncCheckoutEmailConsent } from "@/lib/actions/email";

export default function EmailConsent({
  email,
  checked,
  onChange,
}: {
  email: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if ((!checked && !touched) || (checked && !email)) return;
    let current = true;
    const timer = setTimeout(() => {
      void syncCheckoutEmailConsent(email, checked)
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
  }, [email, checked, touched]);
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 text-caption leading-relaxed text-stone-600">
        <input
          type="checkbox"
          name="emailConsent"
          checked={checked}
          onChange={(e) => {
            setTouched(true);
            setError("");
            onChange(e.target.checked);
          }}
          className="mt-1 h-4 w-4 shrink-0 accent-stone-900"
        />
        <span>
          Согласен на обработку email и письма Roota о заказах, корзине, отзывах
          и новых коллекциях.
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-caption text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
