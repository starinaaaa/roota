"use client";
import { useState } from "react";
import { ManualInstructions } from "./MarketExtras";
import type { PaymentForm } from "@robokassa/sdk";
import { money, type PublicSale } from "@/lib/market/model";
import {
  Creature,
  QrCode,
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
    [accepted, setAccepted] = useState(true),
    [marketingConsent, setMarketingConsent] = useState(true),
    [contactSaved, setContactSaved] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const expired = useSaleExpired(sale);
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { form, saved } = await marketFetch<{
        form?: PaymentForm;
        saved?: boolean;
      }>(`/api/market/pay/${token}`, {
        email,
        accepted,
        marketingConsent,
        reviewConsent: marketingConsent,
      });
      if (saved) {
        setContactSaved(true);
        setBusy(false);
        return;
      }
      if (!form) throw new Error("Не удалось подготовить оплату");
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
      ) : sale.status === "paid" &&
        (sale.method === "robokassa" || contactSaved) ? (
        <section className="market-message market-success">
          <Creature id={2891} />
          <span className="market-status-pill">
            {sale.mode === "test" ? "Тест завершён" : "Оплачено"}
          </span>
          <h1>Теперь это ваше.</h1>
          <p>
            Спасибо за встречу!
            <br />
            {sale.method === "robokassa"
              ? "Чек по оплате через Робокассу придёт на вашу почту."
              : "Чек ФНС появится на экране продавца после регистрации. Его можно забрать по QR."}
          </p>
          <strong className="market-paid-amount">{money(sale.amount)}</strong>
          {sale.receiptUrl ? (
            <a href={sale.receiptUrl} target="_blank" rel="noreferrer">
              <QrCode value={sale.receiptUrl} />
              Открыть чек ФНС ↗
            </a>
          ) : null}
        </section>
      ) : (sale.status !== "pending" && sale.status !== "paid") || expired ? (
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
      ) : returning && sale.method === "robokassa" ? (
        <section className="market-message">
          <Creature id={2899} />
          <h1>Проверяем оплату</h1>
          <p>
            Ждём подтверждение от Робокассы. Если деньги списались, повторно
            платить не нужно — продавец проверит покупку.
          </p>
        </section>
      ) : sale.method !== "robokassa" && contactSaved ? (
        <section className="market-message">
          <h1>Всё готово к оплате</h1>
          <ReceiptItems sale={sale} />
          <ManualInstructions sale={sale} />
          <p className="market-small">
            Продавец подтвердит получение денег. Чек выдаётся отдельно.
          </p>
        </section>
      ) : (
        <section className="market-phone-receipt">
          <div className="market-phone-title">
            <div>
              <p className="market-eyebrow">{sale.number}</p>
              <h1>Ваша покупка</h1>
            </div>
            <Creature id={2912} />
          </div>
          {sale.mode === "test" ? (
            <p className="market-test">Тест · без списания денег</p>
          ) : null}
          <ReceiptItems sale={sale} />
          <div className="market-receipt-total">
            <span>{sale.status === "paid" ? "Оплачено" : "К оплате"}</span>
            <strong>{money(sale.amount)}</strong>
          </div>
          <form onSubmit={pay}>
            <label htmlFor="market-email">
              {sale.method === "robokassa"
                ? "Email для чека"
                : "Email для связи"}
            </label>
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
            <p className="market-small">
              {sale.method === "robokassa"
                ? "На эту почту придёт чек Робокассы."
                : "Почта — по желанию. Чек ФНС можно забрать по QR у продавца."}
            </p>
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
            <label className="market-consent market-marketing-consent">
              <input
                type="checkbox"
                name="marketingConsent"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
              />
              <span>
                Хочу получать{" "}
                <a href="/newsletter-consent" target="_blank" rel="noreferrer">
                  информацию о скидках, распродажах, новых коллекциях и
                  приглашение поделиться впечатлениями о покупке
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
              {busy
                ? "Сохраняем…"
                : sale.method === "robokassa"
                  ? `Перейти к оплате · ${money(sale.amount)}`
                  : sale.status === "paid"
                    ? "Сохранить почту"
                    : "Сохранить почту и продолжить"}
            </button>
            <p className="market-secure">
              {sale.method === "robokassa"
                ? "Картой или другим доступным способом через Робокассу"
                : "Оплату подтвердит продавец"}
            </p>
          </form>
          {sale.method !== "robokassa" ? (
            <button
              type="button"
              className="market-secondary"
              disabled={busy}
              onClick={() => setContactSaved(true)}
            >
              Продолжить без почты
            </button>
          ) : null}
          <p className="market-small">
            Галочку писем можно снять. Получение чека и оплата от подписки не
            зависят.
          </p>
        </section>
      )}
    </main>
  );
}
