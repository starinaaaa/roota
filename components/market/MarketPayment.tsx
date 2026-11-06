"use client";
import { useState } from "react";
import type { PaymentForm } from "@robokassa/sdk";
import { money, type PublicSale } from "@/lib/market/model";
import {
  Creature,
  MarketBrand,
  ReceiptItems,
  marketFetch,
  useMarketPoll,
  useSaleExpired,
} from "./shared";
export default function MarketPayment({
  token,
  returning = false,
}: {
  token: string;
  returning?: boolean;
}) {
  const { data: sale, error: connectionError } = useMarketPoll<PublicSale>(
    `/api/market/pay/${token}`,
  );
  const [email, setEmail] = useState(""),
    [accepted, setAccepted] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const expired = useSaleExpired(sale);
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { form } = await marketFetch<{ form: PaymentForm }>(
        `/api/market/pay/${token}`,
        { email, accepted },
      );
      // POST directly to the official payment page. No browser return marks a sale paid.
      const target = new URL(form.action);
      if (target.origin !== "https://auth.robokassa.ru")
        throw new Error("Не удалось открыть оплату");
      const element = document.createElement("form");
      element.method = "POST";
      element.action = form.action;
      for (const [name, value] of Object.entries(form.fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        element.appendChild(input);
      }
      document.body.appendChild(element);
      element.submit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось начать оплату");
      setBusy(false);
    }
  }
  return (
    <main className="market-phone">
      <header>
        <MarketBrand />
        <span className="market-eyebrow">Маленькая находка</span>
      </header>
      {connectionError ? (
        <section className="market-message">
          <Creature id={2905} />
          <h1>Проверяем покупку</h1>
          <p>{connectionError}</p>
          <p>
            Если деньги уже списались, не платите повторно. Обратитесь к
            продавцу.
          </p>
        </section>
      ) : !sale ? (
        <section className="market-message">
          <Creature />
          <h1>Готовим покупку…</h1>
        </section>
      ) : sale.status === "paid" ? (
        <section className="market-message market-success">
          <Creature id={2891} />
          <span className="market-status-pill">
            {sale.mode === "test" ? "Тест завершён" : "Оплачено"}
          </span>
          <h1>Теперь это ваше.</h1>
          <p>
            Спасибо за встречу!
            <br />
            Чек придёт на вашу почту.
          </p>
          <strong className="market-paid-amount">{money(sale.amount)}</strong>
        </section>
      ) : sale.status !== "pending" || expired ? (
        <section className="market-message">
          <Creature id={2905} />
          <h1>
            {sale.status === "paid_review"
              ? "Проверяем оплату"
              : "Этот код уже закрыт"}
          </h1>
          <p>
            Обратитесь к продавцу.
            {sale.status === "paid_review"
              ? " Если деньги списались, повторно платить не нужно."
              : " Он подготовит новую покупку."}
          </p>
        </section>
      ) : returning ? (
        <section className="market-message">
          <Creature id={2899} />
          <h1>Проверяем оплату</h1>
          <p>
            Ждём подтверждение от Робокассы. Если деньги списались, повторно
            платить не нужно — продавец проверит покупку.
          </p>
        </section>
      ) : sale.method !== "robokassa" ? (
        <section className="market-message">
          <h1>Покупка у продавца</h1>
          <p>Эта покупка оплачивается на месте. Обратитесь к продавцу.</p>
        </section>
      ) : (
        <section className="market-phone-receipt">
          <div className="market-phone-title">
            <div>
              <p className="market-eyebrow">{sale.number}</p>
              <h1>Забрать с собой</h1>
            </div>
            <Creature id={2912} />
          </div>
          {sale.mode === "test" ? (
            <p className="market-test">Тест · без списания денег</p>
          ) : null}
          <ReceiptItems sale={sale} />
          <div className="market-receipt-total">
            <span>К оплате</span>
            <strong>{money(sale.amount)}</strong>
          </div>
          <form onSubmit={pay}>
            <label htmlFor="market-email">Email для чека</label>
            <input
              id="market-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="market-small">Отправим чек на эту почту.</p>
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
            {error ? (
              <p role="alert" className="market-error">
                {error}
              </p>
            ) : null}
            <button className="market-primary" disabled={busy}>
              {busy ? "Открываем оплату…" : `Оплатить ${money(sale.amount)}`}
            </button>
            <p className="market-secure">
              Картой или другим доступным способом через Робокассу
            </p>
          </form>
        </section>
      )}
      <footer>Сделано руками. Выбрано сердцем.</footer>
    </main>
  );
}
