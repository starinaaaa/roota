"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Minus,
  Monitor,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import {
  Creature,
  MarketBrand,
  QrCode,
  ReceiptItems,
  marketFetch,
  useMarketPoll,
  useSaleExpired,
} from "./shared";
import {
  money,
  quoteBasket,
  statusLabel,
  type InventoryItem,
  type MarketState,
  type PaymentMethod,
} from "@/lib/market/model";

import {
  NewMarketItem,
  TransferPreferences,
  ReceiptTasks,
  ReceiptDownload,
  ManualInstructions,
} from "./MarketExtras";

const marketPhotos: Record<string, string> = Object.fromEntries(
  ["nevidimka", "potseluy", "kolybelny", "solnyshko"].map((slug) => [
    `plate-${slug}`,
    `/images/market/plate-${slug}.webp`,
  ]),
);

function Counter({
  value,
  max,
  name,
  disabled,
  onChange,
}: {
  value: number;
  max: number;
  name: string;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="market-counter">
      <button
        type="button"
        aria-label={`Уменьшить: ${name}`}
        disabled={disabled || value === 0}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={16} />
      </button>
      <input
        aria-label={`Количество: ${name}`}
        type="number"
        min={0}
        max={Math.min(max, 100)}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 0 && n <= Math.min(max, 100))
            onChange(n);
        }}
      />
      <button
        type="button"
        aria-label={`Добавить: ${name}`}
        disabled={disabled || value >= Math.min(max, 100)}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
function StockSettings({
  inventory,
  busy,
  onClose,
  onSave,
  error,
  onAdd,
}: {
  inventory: InventoryItem[];
  error: string;
  busy: boolean;
  onClose: () => void;
  onSave: (data: unknown) => Promise<void>;
  onAdd: (data: unknown) => Promise<void>;
}) {
  const [items, setItems] = useState(() =>
    inventory.map((i) => ({
      key: i.key,
      price: i.price,
      stock: i.stock_qty,
      previousStock: i.stock_qty,
      previousPrice: i.price,
    })),
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="market-modal"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="market-settings-title"
    >
      <header>
        <div>
          <p className="market-eyebrow">Всё готово к встрече</p>
          <h2 id="market-settings-title">Что берём на маркет?</h2>
        </div>
        <button
          aria-label="Закрыть настройки"
          onClick={onClose}
          disabled={busy}
        >
          <X />
        </button>
      </header>
      <p>
        У маркета свой склад. Эти цены, позиции и остатки не меняют
        интернет-магазин. Можно добавить изделия, которых нет на сайте.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onSave({ items });
        }}
      >
        <div className="market-stock-table">
          <div className="market-stock-heading">
            <span>Изделие</span>
            <span>Цена, ₽</span>
            <span>На маркете</span>
          </div>
          {inventory.map((i, index) => (
            <div className="market-stock-row" key={i.key}>
              <label htmlFor={`stock-${i.key}`}>
                {i.name}
                <small>Отдельный запас маркета</small>
              </label>
              <input
                aria-label={`Цена: ${i.name}`}
                inputMode="numeric"
                type="number"
                min="1"
                max="1000000"
                value={items[index].price ?? ""}
                onChange={(e) =>
                  setItems((current) =>
                    current.map((v, n) =>
                      n === index
                        ? {
                            ...v,
                            price: e.target.value
                              ? Number(e.target.value)
                              : null,
                          }
                        : v,
                    ),
                  )
                }
              />
              <input
                id={`stock-${i.key}`}
                type="number"
                min="0"
                max="100000"
                required
                value={items[index].stock}
                onChange={(e) =>
                  setItems((current) =>
                    current.map((v, n) =>
                      n === index ? { ...v, stock: Number(e.target.value) } : v,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
        <p className="market-small">
          До первого подключения остатки равны нулю. Для открыток укажите цену и
          10 штук, для каждой тарелки — до 5. Для Сада посчитайте детали каждого
          вида.
        </p>
        {error ? (
          <p role="alert" className="market-error">
            {error}
          </p>
        ) : null}
        <button className="market-primary" disabled={busy}>
          {busy ? "Сохраняем…" : "Сохранить цены и остатки"}
        </button>
      </form>
      <NewMarketItem busy={busy} onSave={onAdd} />
    </dialog>
  );
}
export default function MarketControl() {
  const {
    data,
    error: connectionError,
    setData,
  } = useMarketPoll<MarketState>("/api/market/admin");
  const [quantities, setQuantities] = useState<Record<string, number>>({}),
    [gardenBundle, setGardenBundle] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [settings, setSettings] = useState<InventoryItem[] | null>(null);
  const [pairOpen, setPairOpen] = useState(false),
    [pairCode, setPairCode] = useState("");
  const key = useRef<string | null>(null);
  const lastMethod = useRef<PaymentMethod>("robokassa");
  const [preferences, setPreferences] = useState(false);
  const sale = data?.sale ?? null,
    expired = useSaleExpired(sale);
  const locked = busy || Boolean(sale);
  let quote: ReturnType<typeof quoteBasket> | null = null,
    quoteError = "";
  try {
    if (data && Object.values(quantities).some(Boolean))
      quote = quoteBasket(
        {
          requestKey: "00000000-0000-4000-8000-000000000000",
          quantities,
          gardenBundle,
        },
        data.inventory,
      );
  } catch (e) {
    quoteError = e instanceof Error ? e.message : "Проверьте состав";
  }
  async function action(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const next = await marketFetch<MarketState>("/api/market/admin", body);
      setData(next);
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function change(keyName: string, n: number) {
    key.current = null;
    setQuantities((v) => ({ ...v, [keyName]: n }));
  }
  async function show(method: PaymentMethod) {
    if (lastMethod.current !== method) key.current = null;
    lastMethod.current = method;
    key.current ??= crypto.randomUUID();
    await action({
      action: "show",
      method,
      basket: { requestKey: key.current, quantities, gardenBundle },
    });
  }
  async function clear() {
    if (await action({ action: "clear" })) {
      key.current = null;
      setQuantities({});
    }
  }
  const displaysOnline =
    data?.displays.filter((d) => Date.now() - Date.parse(d.lastSeenAt) < 12000)
      .length ?? 0;
  const chosen = sale ?? (quote ? { ...quote } : null);
  return (
    <main className="market-control">
      <header className="market-control-header">
        <div className="market-logo-group">
          <MarketBrand />
          <span className="market-header-divider" />
          <span className="market-eyebrow">Маркет</span>
        </div>
        <div className="market-header-actions">
          <span className="market-date">Ceramania · 21–22 ноября</span>
          <Link
            className="market-icon-link"
            href="/admin"
            aria-label="В управление студией"
          >
            <ArrowLeft size={18} />
          </Link>
        </div>
      </header>
      <div className="market-control-title">
        <div>
          <p className="market-eyebrow">Ceramania · Москва · 21–22 ноября</p>
          <h1>Маркет</h1>
        </div>
        <div className="market-toolbar">
          <button
            className="market-secondary"
            onClick={() => setPairOpen((v) => !v)}
          >
            <Monitor size={16} />
            <span
              className={`market-live-dot ${displaysOnline ? "is-online" : ""}`}
            />
            {displaysOnline ? "iPad подключён" : "Подключить iPad"}
          </button>
          <button
            className="market-secondary"
            disabled={!data || busy || sale?.status === "pending"}
            onClick={() => setSettings(data!.inventory.map((i) => ({ ...i })))}
          >
            <Settings2 size={16} />
            Товары и остатки
          </button>
        </div>
      </div>
      {data ? (
        <div className="market-extra-toolbar">
          <button
            className="market-secondary"
            onClick={() => setPreferences((v) => !v)}
          >
            Реквизиты для перевода
          </button>
          <a className="market-secondary" href="/api/market/label">
            Скачать визитку · PDF 40×58
          </a>
          <a href="/market/hello" target="_blank" rel="noreferrer">
            Страница знакомства ↗
          </a>
        </div>
      ) : null}
      {preferences && data ? (
        <TransferPreferences
          initial={data.transferSettings}
          busy={busy}
          onSave={async (input) => {
            if (await action({ action: "transfer-settings", data: input }))
              setPreferences(false);
          }}
        />
      ) : null}
      {pairOpen ? (
        <section className="market-pair-panel">
          <div>
            <h2>Один раз познакомим экраны</h2>
            <p>
              Откройте{" "}
              <a href="/market/display" target="_blank" rel="noreferrer">
                roota.moscow/market/display <ArrowUpRight size={14} />
              </a>{" "}
              на iPad и получите код.
            </p>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await action({ action: "pair", code: pairCode })) {
                setPairCode("");
                setPairOpen(false);
              }
            }}
          >
            <label className="sr-only" htmlFor="pair-code">
              Код с iPad
            </label>
            <input
              id="pair-code"
              placeholder="ABCD 1234"
              autoComplete="off"
              maxLength={12}
              value={pairCode}
              onChange={(e) => setPairCode(e.target.value.toUpperCase())}
              required
            />
            <button className="market-primary" disabled={busy}>
              Подключить
            </button>
          </form>
          {data?.displays.map((d, index) => (
            <div className="market-device" key={d.id}>
              <span>Экран {index + 1}</span>
              <button
                disabled={busy}
                onClick={() => action({ action: "revoke", id: d.id })}
              >
                Отключить
              </button>
            </div>
          ))}
        </section>
      ) : null}
      {connectionError || error ? (
        <p className="market-alert" role="alert">
          {error || `Нет связи с кассой. ${connectionError}`}
        </p>
      ) : null}
      {data?.mode === "test" ? (
        <p className="market-test">
          Тестовый режим · деньги не списываются, остатки не расходуются
        </p>
      ) : data && !data.mode ? (
        <p className="market-alert">
          Оплата Робокассы не настроена. Выбор товаров и подключение экрана
          доступны.
        </p>
      ) : null}
      {!data ? (
        <section className="market-message">
          <Creature id={2899} />
          <h2>Готовим ваш стол…</h2>
        </section>
      ) : (
        <>
          <div className="market-workspace">
            <div className="market-products">
              <section>
                <div className="market-section-heading">
                  <h2>Изделия</h2>
                  <span>Каталог маркета</span>
                </div>
                <div className="market-product-grid">
                  {data.inventory
                    .filter((i) =>
                      ["plate", "postcard", "object"].includes(i.kind),
                    )
                    .map((i, index) => (
                      <article
                        className={`market-product-card ${(quantities[i.key] ?? 0) > 0 ? "is-selected" : ""}`}
                        key={i.key}
                      >
                        <div
                          className={`market-product-image market-tone-${index % 4}`}
                        >
                          {i.image || marketPhotos[i.key] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={i.image || marketPhotos[i.key]}
                              alt={i.name}
                              loading="lazy"
                            />
                          ) : (
                            <Creature
                              id={
                                i.kind === "postcard"
                                  ? 2912
                                  : [2891, 2895, 2907, 2903][index % 4]
                              }
                            />
                          )}
                          {(quantities[i.key] ?? 0) > 0 ? (
                            <span className="market-selected-mark">
                              <Check size={16} />
                            </span>
                          ) : null}
                        </div>
                        <div className="market-product-info">
                          <h3>{i.name}</h3>
                          <p>
                            {i.price ? money(i.price) : "Укажите цену"}
                            <span>
                              {i.stock_qty
                                ? `${i.stock_qty} шт. на столе`
                                : "Пока нет на столе"}
                            </span>
                          </p>
                          <Counter
                            name={i.name}
                            value={quantities[i.key] ?? 0}
                            max={i.stock_qty}
                            disabled={
                              locked || !i.price || Boolean(connectionError)
                            }
                            onChange={(n) => change(i.key, n)}
                          />
                        </div>
                      </article>
                    ))}
                </div>
              </section>
              <section className="market-garden">
                <div className="market-section-heading">
                  <div>
                    <p className="market-eyebrow">Керамический конструктор</p>
                    <h2>Сад</h2>
                  </div>
                  <Creature id={2909} />
                </div>
                <div
                  className="market-segmented"
                  aria-label="Способ покупки Сада"
                >
                  {[
                    [true, "Собрать набор"],
                    [false, "Детали поштучно"],
                  ].map(([bundle, label]) => (
                    <button
                      key={String(bundle)}
                      aria-pressed={gardenBundle === bundle}
                      disabled={locked}
                      onClick={() => {
                        key.current = null;
                        setGardenBundle(Boolean(bundle));
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {data.inventory
                  .filter((i) =>
                    ["stems", "flowers", "leaves"].includes(i.kind),
                  )
                  .map((i) => (
                    <div className="market-garden-row" key={i.key}>
                      <div>
                        <h3>{i.name}</h3>
                        <p>
                          {money(i.price ?? 0)} / шт. · осталось {i.stock_qty}
                        </p>
                      </div>
                      <Counter
                        name={i.name}
                        value={quantities[i.key] ?? 0}
                        max={i.stock_qty}
                        disabled={
                          locked || !i.price || Boolean(connectionError)
                        }
                        onChange={(n) => change(i.key, n)}
                      />
                    </div>
                  ))}
                <p className="market-small">
                  В наборе 16–23 детали — скидка 5%, от 24 — 10%. В поштучном
                  режиме скидки нет.
                </p>
              </section>
            </div>
            <aside className="market-receipt">
              <div className="market-receipt-top">
                <p className="market-eyebrow">Состав покупки</p>
                <h2>{sale ? sale.number : "Покупка"}</h2>
                <span className="market-receipt-star">✳</span>
              </div>
              {chosen ? (
                <>
                  <ReceiptItems sale={chosen} />
                  <div className="market-receipt-total">
                    <span>Всего</span>
                    <strong>{money(chosen.amount)}</strong>
                  </div>
                  {quote?.discount && !sale ? (
                    <p className="market-saving">
                      Скидка на Сад {quote.discount}% уже учтена
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="market-empty-receipt">
                  <Creature id={2907} />
                  <p>Выберите изделия</p>
                  <small>Добавьте изделия слева</small>
                </div>
              )}
              {sale ? (
                <div className="market-sale-actions">
                  <span
                    className={`market-status-pill ${sale.status === "paid_review" ? "is-warning" : ""}`}
                    role="status"
                  >
                    {expired ? "Время кода истекло" : statusLabel(sale.status)}
                  </span>
                  {sale.status === "pending" &&
                  !expired &&
                  sale.paymentUrl &&
                  !connectionError ? (
                    <>
                      <div className="market-mini-qr">
                        <QrCode value={sale.paymentUrl} />
                      </div>
                      <p className="market-small">
                        {sale.method === "robokassa"
                          ? "QR отправлен на iPad. Email для чека покупатель вводит на телефоне."
                          : "Покупатель проверяет сумму и получателя в банковском приложении."}
                      </p>
                    </>
                  ) : null}
                  {sale.status === "pending" && sale.method !== "robokassa" ? (
                    <>
                      <ManualInstructions sale={sale} />
                      <button
                        className="market-primary"
                        disabled={busy || expired || Boolean(connectionError)}
                        onClick={async () => {
                          if (
                            window.confirm(
                              sale.method === "transfer"
                                ? "Вы проверили в своём банке поступление полной суммы? Скриншот покупателя не подтверждает поступление."
                                : "Вы получили полную сумму наличными?",
                            )
                          )
                            await action({
                              action: "confirm-manual",
                              id: sale.id,
                            });
                        }}
                      >
                        Деньги получены
                      </button>
                    </>
                  ) : null}
                  {sale.status === "paid" &&
                  sale.method !== "robokassa" &&
                  !sale.receiptUrl ? (
                    <div className="market-receipt-needed" role="status">
                      <p>Продажа сохранена. Чек ФНС ещё не выдан.</p>
                      <a
                        className="market-primary"
                        href="#market-receipt-tasks"
                      >
                        Выдать чек в «Моём налоге» ↓
                      </a>
                    </div>
                  ) : null}
                  <ReceiptDownload sale={sale} />
                  {sale.status === "paid_review" ? (
                    <p className="market-error">
                      Деньги пришли после отмены или истечения срока. Проверьте
                      платёж в Робокассе и наличие товара перед выдачей.
                    </p>
                  ) : null}
                  {sale.status === "pending" ? (
                    <button
                      className="market-secondary"
                      disabled={busy || Boolean(connectionError)}
                      onClick={async () => {
                        if (
                          window.confirm(
                            "Отменить покупку и вернуть товары в остаток? Если покупатель уже открыл оплату, он ещё может перечислить деньги — такая оплата потребует проверки.",
                          )
                        )
                          await action({ action: "cancel", id: sale.id });
                      }}
                    >
                      Отменить покупку
                    </button>
                  ) : (
                    <button
                      className="market-primary"
                      disabled={busy || Boolean(connectionError)}
                      onClick={clear}
                    >
                      Следующая покупка <ArrowUpRight size={18} />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p className="market-error" role="status">
                    {quoteError}
                  </p>
                  <div className="market-payment-choices">
                    <button
                      className="market-primary"
                      disabled={
                        !quote || busy || Boolean(connectionError) || !data.mode
                      }
                      onClick={() => show("robokassa")}
                    >
                      Робокасса · показать QR <ArrowUpRight size={18} />
                    </button>
                    <div>
                      <button
                        className="market-secondary"
                        disabled={!quote || busy || Boolean(connectionError)}
                        onClick={() => show("transfer")}
                      >
                        Перевод
                      </button>
                      <button
                        className="market-secondary"
                        disabled={!quote || busy || Boolean(connectionError)}
                        onClick={() => show("cash")}
                      >
                        Наличные
                      </button>
                    </div>
                  </div>
                  <p className="market-small">
                    Сумма и состав появятся на экране покупателя. Код действует
                    15 минут.
                  </p>
                </>
              )}
            </aside>
          </div>
          <ReceiptTasks state={data} busy={busy} action={action} />
          <section className="market-sales">
            <div className="market-section-heading">
              <h2>Продажи на маркете</h2>
              <span>
                {data.totals.count} покупок · {money(data.totals.amount)}
              </span>
            </div>
            {data.history.length ? (
              <div className="market-sales-list">
                {data.history.map((s) => (
                  <details key={s.id}>
                    <summary>
                      <span>
                        {s.number}
                        {s.mode === "test" ? " · тест" : ""}
                      </span>
                      <span
                        className={
                          s.status === "paid_review" ? "market-error" : ""
                        }
                      >
                        {statusLabel(s.status)}
                      </span>
                      <strong>{money(s.amount)}</strong>
                    </summary>
                    <ReceiptItems sale={s} />
                    <ReceiptDownload sale={s} />
                  </details>
                ))}
              </div>
            ) : (
              <p className="market-small">
                Здесь появятся покупки. Первую историю ещё предстоит встретить.
              </p>
            )}
          </section>
        </>
      )}
      <footer className="market-control-footer">
        Roota ceramics <span>Ceramania · 21–22 ноября</span>
      </footer>
      {settings ? (
        <StockSettings
          inventory={settings}
          onAdd={async (input) => {
            if (await action({ action: "add-item", data: input }))
              setSettings(null);
          }}
          error={error}
          busy={busy}
          onClose={() => setSettings(null)}
          onSave={async (input) => {
            if (await action({ action: "stock", data: input })) {
              setSettings(null);
              key.current = null;
              setQuantities({});
            }
          }}
        />
      ) : null}
    </main>
  );
}
