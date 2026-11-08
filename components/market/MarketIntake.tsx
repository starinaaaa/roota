"use client";
import { useEffect, useRef, useState } from "react";
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
  useEffect(() => {
    if (data?.redirectUrl) window.location.replace(data.redirectUrl);
  }, [data?.redirectUrl]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview) {
      router.push("/market/preview/transfer");
      return;
    }
    setBusy(true);
    setError("");
    key.current ??= crypto.randomUUID();
    try {
      const r = await marketFetch<{ url: string }>("/api/market/intake", {
        requestKey: key.current,
        amount,
        email,
        method,
        accepted,
        marketingConsent: news,
      });
      window.location.assign(r.url);
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
                    Продавец уточнит состав покупки и выдаст чек. Он придёт на
                    вашу почту и появится на этой странице. Можно закрыть
                    страницу, ожидать у iPad не нужно.
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
              Сумма покупки, ₽
              <input
                required
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="12000"
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
            <label>
              Как оплатить
              <select
                name="method"
                value={method}
                onChange={(e) => {
                  edit();
                  setMethod(e.target.value);
                }}
              >
                <option value="transfer">Прямой перевод</option>
                <option value="cash">Наличные</option>
                {data.robokassa ? (
                  <option value="robokassa">
                    Робокасса · после уточнения состава
                  </option>
                ) : null}
              </select>
            </label>
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
              <span>
                Хочу получать{" "}
                <a href="/newsletter-consent" target="_blank" rel="noreferrer">
                  информацию о скидках, распродажах и новых коллекциях
                </a>{" "}
                и даю{" "}
                <a
                  href="/newsletter-data-consent"
                  target="_blank"
                  rel="noreferrer"
                >
                  согласие на обработку email
                </a>
                .
              </span>
            </label>
            {error ? (
              <p role="alert" className="market-error">
                {error}
              </p>
            ) : null}
            <button className="market-primary" disabled={busy}>
              {busy ? "Сохраняем…" : "Сохранить почту и продолжить"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
