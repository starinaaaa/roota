"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmManualDraft } from "@/lib/actions/manual-orders";
import {
  contactChannels,
  contactForChannel,
  type ContactChannel,
} from "@/lib/courier-contact";
import { LEGAL_VERSION } from "@/lib/legal";
export default function ManualConfirmation({
  token,
  name,
  email,
  phone,
  courier,
}: {
  token: string;
  name: string;
  email: string;
  phone: string;
  courier: boolean;
}) {
  const [channel, setChannel] = useState<ContactChannel | "">(""),
    [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await confirmManualDraft(token, {
            ...Object.fromEntries(f),
            acceptedTerms: f.get("acceptedTerms") === "on",
            legalVersion: LEGAL_VERSION,
            contactChannel: channel || undefined,
            contactValue: value,
          });
          if (r.paymentPath) router.push(r.paymentPath);
          else setError(r.error ?? "Ошибка подтверждения");
        });
      }}
    >
      <fieldset disabled={pending} className="space-y-4">
        <label className="block">
          Имя и фамилия
          <input
            required
            name="name"
            defaultValue={name}
            className="admin-input"
          />
        </label>
        <label className="block">
          Email
          <input
            required
            type="email"
            name="email"
            defaultValue={email}
            className="admin-input"
          />
        </label>
        <label className="block">
          Телефон
          <input
            required
            name="phone"
            defaultValue={phone}
            className="admin-input"
          />
        </label>
        {courier && (
          <>
            <label className="block">
              Где согласовать курьера?
              <select
                required
                value={channel}
                className="admin-input"
                onChange={(e) => {
                  const c = e.target.value as ContactChannel;
                  setChannel(c);
                  const f = e.currentTarget.form!;
                  setValue(
                    contactForChannel(c, {
                      email: String(new FormData(f).get("email") ?? ""),
                    }),
                  );
                }}
              >
                <option value="">Выберите канал</option>
                {Object.entries(contactChannels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {channel && (
              <label className="block">
                Контакт
                <input
                  required
                  type={channel === "email" ? "email" : "text"}
                  value={value}
                  onChange={(e) =>
                    setValue(
                      channel === "email" || e.target.value.startsWith("@")
                        ? e.target.value
                        : `@${e.target.value}`,
                    )
                  }
                  placeholder={
                    channel === "email" ? "example@email.com" : "@username"
                  }
                  className="admin-input"
                />
              </label>
            )}
          </>
        )}
        <label className="flex gap-3">
          <input required name="acceptedTerms" type="checkbox" />
          <span>
            Принимаю{" "}
            <a
              className="underline"
              href="/offer"
              target="_blank"
              rel="noreferrer"
            >
              условия покупки
            </a>
            ; ознакомлен с{" "}
            <a
              className="underline"
              href="/privacy"
              target="_blank"
              rel="noreferrer"
            >
              политикой обработки данных
            </a>
            . Подтверждаю состав, стоимость и условия получения.
          </span>
        </label>
        <button
          className="bg-stone-900 text-white px-6 py-4"
          disabled={pending}
        >
          {pending ? "Подтверждаем…" : "Подтвердить и перейти к оплате"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
