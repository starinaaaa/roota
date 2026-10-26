"use client";
import Link from "next/link";
import { useState } from "react";
import { useShop } from "./Shop";
import { money } from "../lib/catalog";
import { useSessionState } from "./useSessionState";
type Draft = {
  name: string;
  phone: string;
  email: string;
  city: string;
  method: string;
  address: string;
  terms: boolean;
};
const blank: Draft = {
  name: "",
  phone: "+7",
  email: "",
  city: "",
  method: "pickup",
  address: "",
  terms: false,
};
function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    ["name", "phone", "email", "city", "address"].every(
      (key) => typeof v[key] === "string",
    ) &&
    ["pickup", "courier"].includes(String(v.method)) &&
    typeof v.terms === "boolean"
  );
}
export function Checkout() {
  const { items, ready } = useShop();
  const [d, setD, loaded] = useSessionState<Draft>(
    "roota:preview:checkout:v1",
    blank,
    isDraft,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<number | null>(null);
  const [step, setStep] = useState<"form" | "payment" | "paid">("form");
  const [status, setStatus] = useState("");
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  function update(key: keyof Draft, value: string | boolean) {
    setD((old) => ({ ...old, [key]: value }));
    setErrors((old) => ({ ...old, [key]: "" }));
    if (["city", "method", "address"].includes(key)) setQuote(null);
  }
  function validate() {
    const e: Record<string, string> = {};
    if (d.name.trim().length < 2) e.name = "Укажите имя и фамилию";
    if (d.phone.replace(/\D/g, "").length !== 11)
      e.phone = "Проверьте номер: нужно 11 цифр";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))
      e.email = "Укажите корректный email";
    if (!d.city.trim()) e.city = "Укажите город";
    if (d.method === "courier" && !d.address.trim())
      e.address = "Укажите адрес для курьера";
    if (quote === null) e.delivery = "Рассчитайте демонстрационную доставку";
    if (!d.terms) e.terms = "Подтвердите условия для продолжения";
    setErrors(e);
    return !Object.keys(e).length;
  }
  if (!ready || !loaded)
    return (
      <section className="page">
        <p>Загружаем оформление…</p>
      </section>
    );
  if (!items.length)
    return (
      <section className="page">
        <h1>Оформление</h1>
        <p>Добавьте изделия в корзину, чтобы продолжить.</p>
        <Link className="button" href="/catalog">
          Перейти в каталог ↗
        </Link>
      </section>
    );
  if (step === "paid")
    return (
      <section className="page confirmation">
        <p className="eyebrow">Демонстрационный сценарий завершён</p>
        <h1>Всё получилось</h1>
        <p>
          Тестовая оплата на {money(total + (quote ?? 0))} подтверждена в
          браузере.
        </p>
        <p>
          Настоящий заказ и платёж не создавались. Письма и сообщения не
          отправлялись.
        </p>
        <button
          className="button"
          onClick={() => {
            setStep("form");
            setStatus("");
          }}
        >
          Вернуться к проверке
        </button>
      </section>
    );
  if (step === "payment")
    return (
      <section className="page confirmation">
        <p className="eyebrow">Тестовая оплата · локальный симулятор</p>
        <h1>{money(total + (quote ?? 0))}</h1>
        <p>Без банковских реквизитов и списания денег.</p>
        <button
          className="button"
          onClick={() => {
            setStep("paid");
            setStatus("");
          }}
        >
          Подтвердить тестовую оплату
        </button>
        <button
          className="secondary"
          onClick={() =>
            setStatus(
              "Недоступна проверка оплаты. Статус платежа неизвестен — повторите проверку. Это не означает отказ оплаты.",
            )
          }
        >
          Проверить сценарий недоступности статуса
        </button>
        {status && <p role="status">{status}</p>}
        <button
          className="text-button"
          onClick={() => {
            setStep("form");
            setStatus("");
          }}
        >
          ← Вернуться к данным заказа
        </button>
      </section>
    );
  const field = (
    key: "name" | "phone" | "email" | "city" | "address",
    label: string,
    autoComplete: string,
    type = "text",
  ) => (
    <label className="field" key={key}>
      {label}
      <input
        name={key}
        type={type}
        autoComplete={autoComplete}
        value={d[key]}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `error-${key}` : undefined}
        onChange={(e) => update(key, e.target.value)}
      />
      {errors[key] && (
        <span className="error" id={`error-${key}`}>
          {errors[key]}
        </span>
      )}
    </label>
  );
  return (
    <section className="page">
      <p className="eyebrow">Корзина → оформление → тестовая оплата</p>
      <h1>
        Ещё немного —<br />и керамика ваша
      </h1>
      <p className="intro narrow">
        Демонстрация оформления. Введите вымышленные данные: они сохраняются
        только в этой вкладке.
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (validate()) {
            setStep("payment");
            window.scrollTo({ top: 0 });
          } else
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>('[aria-invalid="true"]')
                ?.focus(),
            );
        }}
        className="checkout-grid"
      >
        <div>
          <h2>01 / Контакты</h2>
          <div className="fields">
            {field("name", "Имя и фамилия", "name")}
            {field("phone", "Телефон", "tel", "tel")}
            {field("email", "Email", "email", "email")}
          </div>
          <h2>02 / Доставка</h2>
          {field("city", "Город", "address-level2")}
          <fieldset className="delivery-methods">
            <legend>Способ доставки</legend>
            <label>
              <input
                type="radio"
                name="method"
                checked={d.method === "pickup"}
                onChange={() => update("method", "pickup")}
              />
              Пункт выдачи Ozon · демо
            </label>
            <label>
              <input
                type="radio"
                name="method"
                checked={d.method === "courier"}
                onChange={() => update("method", "courier")}
              />
              Курьер · демо
            </label>
          </fieldset>
          {d.method === "courier" ? (
            field("address", "Улица, дом, квартира", "street-address")
          ) : (
            <p className="muted">
              Тестовый пункт выдачи — учебный адрес, 1. Данные перевозчика не
              запрашиваются.
            </p>
          )}
          <button
            className="secondary"
            type="button"
            onClick={() => {
              if (!d.city.trim()) {
                setErrors((old) => ({
                  ...old,
                  city: "Укажите город для расчёта",
                }));
                return;
              }
              if (d.method === "courier" && !d.address.trim()) {
                setErrors((old) => ({
                  ...old,
                  address: "Укажите адрес для курьера",
                }));
                return;
              }
              setQuote(d.method === "pickup" ? 350 : 550);
              setErrors((old) => ({ ...old, delivery: "" }));
            }}
          >
            Рассчитать доставку · демо
          </button>
          {quote !== null && (
            <p role="status">
              Демонстрационная стоимость: {money(quote)}. Срок: 3–5 дней после
              передачи перевозчику. Это учебные значения.
            </p>
          )}
          {errors.delivery && (
            <p className="error" role="alert">
              {errors.delivery}
            </p>
          )}
          <label className="consent">
            <input
              type="checkbox"
              checked={d.terms}
              onChange={(e) => update("terms", e.target.checked)}
            />
            <span>
              Ознакомился с{" "}
              <Link href="/delivery">условиями покупки и доставки</Link> и
              подтверждаю использование вымышленных данных.
            </span>
          </label>
          {errors.terms && <p className="error">{errors.terms}</p>}
        </div>
        <aside className="summary">
          <h2>Ваш выбор</h2>
          {items.map((i) => (
            <p key={i.key}>
              <span>
                {i.name} × {i.qty}
              </span>
              <strong>{money(i.price * i.qty)}</strong>
            </p>
          ))}
          <p>
            Доставка{" "}
            <strong>{quote === null ? "не рассчитана" : money(quote)}</strong>
          </p>
          <p className="total">
            Итого <strong>{money(total + (quote ?? 0))}</strong>
          </p>
          {items.some((i) => i.configuration) && (
            <p className="muted">
              Изготовление сада — 3 недели после оплаты плюс доставка.
            </p>
          )}
          <button type="submit" className="button">
            Перейти к тестовой оплате ↗
          </button>
          <Link href="/cart" className="back-link">
            ← Изменить корзину
          </Link>
        </aside>
      </form>
    </section>
  );
}
