"use client";
import { useEffect, useRef, useState } from "react";
import type { PaymentForm } from "@robokassa/sdk";
import { openBank } from "./openBank";
import { useRouter } from "next/navigation";
import { Creature, MarketBrand, marketFetch, useMarketPoll } from "./shared";
import { ManualInstructions } from "./MarketExtras";
import {
  money,
  type PublicSale,
  type TransferSettings,
} from "@/lib/market/model";
export type RequestView = {
  number: string;
  amount: number;
  method: PublicSale["method"];
  paid: boolean;
  cancelled: boolean;
  mode: "test" | "live";
  transfer: TransferSettings | null;
  redirectUrl: string | null;
};
export type IntakeView = RequestView & { enabled: boolean; robokassa: boolean };
export default function MarketIntake({
  token,
  preview,
}: {
  token?: string;
  preview?: IntakeView;
}) {
  const router = useRouter();
  const { data, error: connectionError } = useMarketPoll<IntakeView>(
    token ? `/api/market/intake/${token}` : "/api/market/intake",
    preview,
  );
  const [amount, setAmount] = useState(""),
    [email, setEmail] = useState(""),
    [method, setMethod] = useState("transfer"),
    [accepted, setAccepted] = useState(true),
    [news, setNews] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef<string | null>(null);
  const normalizedAmount = amount.replace(/\s/g, "").replace(",", ".");
  useEffect(() => {
    if (data?.redirectUrl) window.location.replace(data.redirectUrl);
  }, [data?.redirectUrl]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview) {
      router.push(
        "/market/preview/" + (method === "robokassa" ? "email" : method),
      );
      return;
    }
    setBusy(true);
    setError("");
    key.current ??= crypto.randomUUID();
    try {
      const r = await marketFetch<{ url: string; form?: PaymentForm }>(
        "/api/market/intake",
        {
          requestKey: key.current,
          amount,
          email,
          method,
          accepted,
          marketingConsent: news,
        },
      );
      if (r.form) {
        window.history.replaceState(null, "", r.url);
        openBank(r.form);
      } else window.location.assign(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить покупку");
      setBusy(false);
    }
  }
  function edit() {
    key.current = null;
  }
  return (
    <main className="market-phone">
      <header>
        <MarketBrand />
      </header>
      <section className="market-phone-receipt">
        <div className="market-phone-title">
          <h1>{token ? "Ваша покупка" : "Покупка на маркете"}</h1>
          <Creature id={2912} />
        </div>
        {connectionError ? (
          <p role="alert">
            Не удалось обновить покупку. Не платите повторно, обратитесь к
            продавцу.
          </p>
        ) : null}
        {!data ? (
          <p>Загружаем…</p>
        ) : token ? (
          <>
            <p className="market-eyebrow">
              {data.number}
              {data.mode === "test" ? " · тест" : ""}
            </p>
            <strong className="market-paid-amount">{money(data.amount)}</strong>
            {data.cancelled ? (
              <p>Покупка отменена. Обратитесь к продавцу.</p>
            ) : data.redirectUrl ? (
              <p>Открываем вашу покупку…</p>
            ) : (
              <>
                <h2>{data.paid ? "Деньги получены" : "Способ оплаты"}</h2>
                {data.paid ? (
                  <p>
                    Всё оплачено, покупку можно забирать. Чек появится здесь и
                    придёт на вашу почту.
                  </p>
                ) : data.method === "robokassa" ? (
                  <p>
                    Назовите продавцу номер {data.number}. Он уточнит состав
                    покупки, после этого здесь появится переход к оплате через
                    Робокассу.
                  </p>
                ) : (
                  <>
                    <ManualInstructions
                      sale={
                        {
                          method: data.method,
                          transfer: data.transfer,
                          amount: data.amount,
                        } as PublicSale
                      }
                    />
                    <p>
                      Назовите продавцу номер {data.number}. После проверки
                      денег продавец подтвердит оплату. Чек отправим на
                      сохранённую почту после уточнения состава.
                    </p>
                  </>
                )}
              </>
            )}
          </>
        ) : !data.enabled ? (
          <p>Приём покупок по QR сейчас закрыт. Обратитесь к продавцу.</p>
        ) : (
          <form onSubmit={submit}>
            <label>
              Сумма, которую назвал продавец
              <input
                required
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => {
                  edit();
                  setAmount(e.target.value);
                }}
              />
            </label>
            <label>
              Email для чека
              <input
                required
                name="email"
                aria-describedby="intake-email-hint"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="next"
                maxLength={254}
                value={email}
                onChange={(e) => {
                  edit();
                  setEmail(e.target.value);
                }}
              />
            </label>
            <p className="market-small" id="intake-email-hint">
              Сюда придёт чек
            </p>
            <fieldset className="market-methods">
              <legend>Как оплатить</legend>
              {[
                ...(data.robokassa
                  ? [["robokassa", "Онлайн через Робокассу"]]
                  : []),
                ["transfer", "Перевод по номеру"],
                ["cash", "Наличные"],
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="method"
                    value={value}
                    checked={method === value}
                    onChange={() => {
                      edit();
                      setMethod(value);
                    }}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="market-consent">
              <input
                type="checkbox"
                required
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                Принимаю{" "}
                <a href="/terms" target="_blank" rel="noreferrer">
                  условия покупки
                </a>{" "}
                и ознакомлен(а) с{" "}
                <a
                  href="/personal-data-policy"
                  target="_blank"
                  rel="noreferrer"
                >
                  политикой обработки данных
                </a>
                .
              </span>
            </label>
            <label className="market-consent">
              <input
                type="checkbox"
                checked={news}
                onChange={(e) => {
                  edit();
                  setNews(e.target.checked);
                }}
              />
              <span>Хочу получать новости Roota</span>
            </label>
            <details className="market-news-terms">
              <summary>Условия подписки</summary>
              <a href="/newsletter-consent" target="_blank" rel="noreferrer">
                Согласие на рассылку
              </a>
              <a
                href="/newsletter-data-consent"
                target="_blank"
                rel="noreferrer"
              >
                Обработка email
              </a>
            </details>
            {error ? (
              <p role="alert" className="market-error">
                {error}
              </p>
            ) : null}
            <button className="market-primary" disabled={busy}>
              {busy
                ? "Сохраняем…"
                : /^\d+(?:\.\d{1,2})?$/.test(normalizedAmount)
                  ? "Продолжить с суммой " + money(Number(normalizedAmount))
                  : "Продолжить"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
