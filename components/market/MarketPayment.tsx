"use client";
import { useEffect, useState } from "react";
import { BuyerReceipt } from "./BuyerReceipt";
import { ManualInstructions } from "./MarketExtras";
import { openPaymentTab, openBank } from "./openBank";
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
export type BuyerSale = PublicSale & {
  emailSaved?: boolean;
  receiptEmail?: string | null;
  receiptEmailState?: string | null;
  marketingConsent?: boolean;
};
export default function MarketPayment({
  token,
  returning = false,
  preview,
}: {
  token: string;
  returning?: boolean;
  preview?: BuyerSale;
}) {
  const { data: sale, error: connectionError } = useMarketPoll<BuyerSale>(
    `/api/market/pay/${token}`,
    preview,
  );
  const [email, setEmail] = useState(""),
    [accepted, setAccepted] = useState(true),
    [marketingChoice, setMarketingConsent] = useState<boolean | null>(null),
    [contactSaved, setContactSaved] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const resume = (event: PageTransitionEvent) => {
      if (event.persisted && window.location.search.includes("return=success"))
        window.location.reload();
    };
    window.addEventListener("pageshow", resume);
    return () => window.removeEventListener("pageshow", resume);
  }, []);
  const expired = useSaleExpired(sale);
  const emailSaved = Boolean(sale?.emailSaved || contactSaved);
  const marketingConsent =
    marketingChoice ?? (sale?.emailSaved ? !!sale.marketingConsent : true);
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (preview) {
      setContactSaved(true);
      setError(
        preview.method === "robokassa"
          ? "Демо: здесь откроется защищённая страница Робокассы."
          : "",
      );
      return;
    }
    setBusy(true);
    setError("");
    const paymentTab = sale?.method === "robokassa" ? openPaymentTab() : null;
    try {
      const { form, saved } = await marketFetch<{
        form?: PaymentForm;
        saved?: boolean;
      }>(`/api/market/pay/${token}`, {
        email: email || undefined,
        accepted,
        marketingConsent,
      });
      if (saved) {
        paymentTab?.close();
        setContactSaved(true);
        setBusy(false);
        return;
      }
      if (!form) throw new Error("Не удалось подготовить оплату");
      openBank(form, `/market/pay/${token}`, paymentTab);
    } catch (e) {
      paymentTab?.close();
      setError(e instanceof Error ? e.message : "Не удалось начать оплату");
      setBusy(false);
    }
  }
  const contactForm = sale ? (
    <form onSubmit={pay}>
      {!emailSaved ? (
        <>
          <label htmlFor="market-email">Email для чека</label>
          <input
            id="market-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={254}
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="market-small">Сюда придёт чек</p>
        </>
      ) : (
        <p className="market-small">Почта для чека сохранена.</p>
      )}
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
          <a href="/personal-data-policy" target="_blank" rel="noreferrer">
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
        <span>Хочу получать новости Roota</span>
      </label>
      <details className="market-news-terms">
        <summary>Условия подписки</summary>
        <a href="/newsletter-consent" target="_blank" rel="noreferrer">
          Согласие на рассылку
        </a>
        <a href="/newsletter-data-consent" target="_blank" rel="noreferrer">
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
          : sale.method === "robokassa"
            ? `Перейти к оплате · ${money(sale.amount)}`
            : sale.status === "paid"
              ? "Получить чек на почту"
              : "Сохранить почту и продолжить"}
      </button>
    </form>
  ) : null;
  return (
    <main className="market-phone">
      <header>
        <MarketBrand />
      </header>
      {connectionError && sale?.status !== "paid" ? (
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
        <section className="market-message market-success market-buyer-paid">
          <Creature id={2891} />
          <span className="market-status-pill">
            {sale.mode === "test" ? "Тест завершён" : "Оплачено"}
          </span>
          <h1>Теперь это ваше.</h1>
          <p>Спасибо за покупку!</p>
          <p className="market-purchase-reference">
            Покупка {sale.number} · <strong>{money(sale.amount)}</strong>
          </p>
          <BuyerReceipt
            sale={sale}
            token={token}
            receiptEmail={sale.receiptEmail || (contactSaved ? email : null)}
            emailSaved={emailSaved}
            emailState={sale.receiptEmailState ?? null}
            preview={!!preview}
          />
          <a className="market-secondary" href="/">
            В магазин Roota
          </a>
          {connectionError ? (
            <p className="market-small">
              Восстанавливаем связь. Покупка оплачена; обновим состояние чека
              после подключения.
            </p>
          ) : null}
          {sale.method !== "robokassa" && !emailSaved ? (
            <details
              className="market-phone-receipt market-paid-contact"
              aria-label="Получить чек на почту"
            >
              <summary className="market-secondary">
                Получить чек на почту
              </summary>
              {contactForm}
            </details>
          ) : null}
        </section>
      ) : sale.status !== "pending" || expired ? (
        <section className="market-message">
          <Creature id={2905} />
          <h1>
            {sale.status === "paid_review"
              ? "Проверяем оплату"
              : "Этот код уже закрыт"}
          </h1>
          {sale.status === "paid_review" && (
            <p className="market-purchase-reference">
              Покупка {sale.number} · {money(sale.amount)}
            </p>
          )}
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
          <p className="market-purchase-reference">
            Покупка {sale.number} · {money(sale.amount)}
          </p>
          <p>
            Ждём подтверждение от Робокассы. Если деньги списались, повторно
            платить не нужно — продавец проверит покупку.
          </p>
        </section>
      ) : sale.method !== "robokassa" ? (
        <section className="market-message">
          <h1>Всё готово к оплате</h1>
          <ReceiptItems sale={sale} />
          <ManualInstructions sale={sale} />
          {!emailSaved && (
            <details className="market-paid-contact">
              <summary>Получить чек на почту</summary>
              {contactForm}
            </details>
          )}
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
            <span>К оплате</span>
            <strong>{money(sale.amount)}</strong>
          </div>
          {contactForm}
        </section>
      )}
    </main>
  );
}
