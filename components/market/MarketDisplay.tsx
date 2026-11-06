"use client";
import { useState } from "react";
import {
  Creature,
  MarketBrand,
  QrCode,
  ReceiptItems,
  marketFetch,
  useMarketPoll,
  useSaleExpired,
} from "./shared";
import { money, type PublicSale, type SocialLinks } from "@/lib/market/model";
import { SocialScreen, ManualInstructions } from "./MarketExtras";
type DisplayState = {
  links: SocialLinks;
  connected: boolean;
  needsPairing: boolean;
  sale: PublicSale | null;
};
export default function MarketDisplay() {
  const { data, error } = useMarketPoll<DisplayState>("/api/market/display");
  const [code, setCode] = useState(""),
    [pairError, setPairError] = useState(""),
    [busy, setBusy] = useState(false);
  const sale = data?.sale ?? null,
    expired = useSaleExpired(sale);
  async function pair() {
    setBusy(true);
    setPairError("");
    try {
      setCode(
        (await marketFetch<{ code: string }>("/api/market/display", {})).code,
      );
    } catch (e) {
      setPairError(e instanceof Error ? e.message : "Не удалось подключиться");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="market-display">
      <header className="market-display-header">
        <MarketBrand />
        <span className="market-eyebrow">
          Авторская керамика · ручная работа
        </span>
      </header>
      <div className="market-display-content" aria-live="polite">
        {error ? (
          <section className="market-message">
            <Creature id={2905} />
            <p className="market-eyebrow">Маленькая пауза</p>
            <h1>
              Восстанавливаем
              <br />
              соединение
            </h1>
            <p>Пожалуйста, подождите. Проверяем покупку.</p>
          </section>
        ) : !data ? (
          <section className="market-message">
            <Creature id={2899} />
            <h1>Секундочку…</h1>
          </section>
        ) : !data.connected ? (
          <section className="market-message">
            <Creature id={2898} />
            <p className="market-eyebrow">Экран покупателя</p>
            <h1>Давайте знакомиться</h1>
            <p>
              Откройте «Маркет» на компьютере
              <br />и подключите этот экран.
            </p>
            {code && !data.needsPairing ? (
              <>
                <strong className="market-pair-code">
                  {code.slice(0, 4)} {code.slice(4)}
                </strong>
                <p className="market-small">
                  Введите этот код на MacBook. Он действует 10 минут.
                </p>
              </>
            ) : (
              <button className="market-primary" disabled={busy} onClick={pair}>
                {busy
                  ? "Подключаем…"
                  : code
                    ? "Получить новый код"
                    : "Получить код подключения"}
              </button>
            )}
            {pairError ? (
              <p role="alert" className="market-error">
                {pairError}
              </p>
            ) : null}
          </section>
        ) : !sale ? (
          <SocialScreen links={data.links} />
        ) : sale.status === "paid" ? (
          <section className="market-message market-success">
            <Creature id={2891} />
            <span className="market-status-pill">
              {sale.mode === "test"
                ? "Тест завершён · деньги не списаны"
                : "Оплачено"}
            </span>
            <h1>Теперь это ваше.</h1>
            <p>
              Спасибо, что забираете
              <br />
              частичку Руты с собой.
            </p>
            <strong className="market-paid-amount">{money(sale.amount)}</strong>
            {sale.receiptUrl ? (
              <div className="market-receipt-qr">
                <QrCode value={sale.receiptUrl} />
                <p>Ваш чек ФНС · наведите камеру</p>
              </div>
            ) : sale.method !== "robokassa" ? (
              <p className="market-small">Продавец готовит ваш чек.</p>
            ) : null}
            <a
              className="market-secondary"
              href={data.links.hello}
              target="_blank"
              rel="noreferrer"
            >
              Останемся на связи ↗
            </a>
          </section>
        ) : sale.status === "pending" && !expired ? (
          <section className="market-pay-display" key={sale.id}>
            <div className="market-pay-description">
              <p className="market-eyebrow">Ваша покупка · {sale.number}</p>
              <h1>Осталось оплатить.</h1>
              <ReceiptItems sale={sale} />
              <div className="market-display-total">{money(sale.amount)}</div>
              <Creature id={2898} className="market-qr-creature" />
            </div>
            <div className="market-code-card">
              {sale.mode === "test" ? (
                <span className="market-test">Тест · без списания денег</span>
              ) : null}
              {sale.paymentUrl ? <QrCode value={sale.paymentUrl} /> : null}
              {sale.method === "robokassa" ? (
                <>
                  <h2>Наведите камеру</h2>
                  <p>
                    Оплатите на своём телефоне.
                    <br />
                    Email понадобится для чека.
                  </p>
                  <span className="market-secure">Оплата через Робокассу</span>
                </>
              ) : (
                <ManualInstructions sale={sale} />
              )}
            </div>
          </section>
        ) : (
          <section className="market-message">
            <Creature id={2905} />
            <h1>
              {sale.status === "paid_review"
                ? "Проверяем оплату"
                : expired || sale.status === "expired"
                  ? "Подготовим новый код"
                  : "Покупка отменена"}
            </h1>
            <p>
              {sale.status === "paid_review"
                ? "Обратитесь к продавцу — он проверит поступление."
                : "Пожалуйста, обратитесь к продавцу."}
            </p>
          </section>
        )}
      </div>
      <footer className="market-display-footer">
        <span>Roota ceramics · Москва</span>
        <span className={`market-connection ${error ? "is-offline" : ""}`}>
          {error
            ? "Нет связи"
            : data?.connected
              ? "Мы рядом"
              : "Roota ceramics"}
        </span>
      </footer>
    </main>
  );
}
