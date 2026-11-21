"use client";
import { useState } from "react";
import {
  money,
  quoteBasket,
  receiptNameSchema,
  marketGoodsName,
  marketPaymentDate,
  type MarketState,
  type MarketIntakeRow,
} from "@/lib/market/model";
import { QrCode, ReceiptItems, marketFetch } from "./shared";
function RequestEditor({
  r,
  state,
  run,
  busy,
}: {
  r: MarketIntakeRow;
  state: MarketState;
  run: (body: unknown) => Promise<void>;
  busy: boolean;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({}),
    [gardenBundle, setGardenBundle] = useState(true),
    [customName, setCustomName] = useState(r.method !== "robokassa"),
    [receiptName, setReceiptName] = useState(marketGoodsName),
    [paidDate, setPaidDate] = useState(() => marketPaymentDate());
  const nameResult = receiptNameSchema.safeParse(receiptName);
  let quote: ReturnType<typeof quoteBasket> | null = null,
    error = "";
  try {
    quote = quoteBasket(
      {
        requestKey: "00000000-0000-4000-8000-000000000000",
        quantities,
        gardenBundle,
      },
      state.inventory,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Проверьте состав";
  }
  const exact =
    !!quote && Math.round(quote.amount * 100) === Math.round(r.amount * 100);
  const ready = customName ? nameResult.success : exact;
  return (
    <details className="market-intake-order">
      <summary>
        <span>
          {r.number}
          {r.mode === "test" ? " · тест" : ""}
        </span>
        <strong>{money(r.amount)}</strong>
        <span>
          {r.method === "cash"
            ? "Наличные"
            : r.method === "transfer"
              ? "Перевод"
              : "Робокасса"}
          {" · "}
          {r.saleId
            ? "Состав сохранён · ожидает оплаты"
            : r.paidAt
              ? "⚠ Оплачено · выберите позицию для чека"
              : "Ожидает подтверждения денег"}
        </span>
      </summary>
      <p>
        {r.method === "cash"
          ? "Наличные"
          : r.method === "transfer"
            ? "Прямой перевод"
            : "Робокасса"}{" "}
        · {r.email || "Без почты"}
      </p>
      <p className="market-small">
        Создана{" "}
        {new Date(r.createdAt).toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        })}
        {r.paidAt
          ? ` · Деньги получены ${new Date(r.paidAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}`
          : ""}
      </p>
      {r.paymentUrl ? (
        <a href={r.paymentUrl} target="_blank" rel="noreferrer">
          Страница этой покупки ↗
        </a>
      ) : null}
      {r.saleId ? (
        <>
          <p>Покупка {r.saleNumber}. Сохранённый состав:</p>
          <ReceiptItems sale={{ items: r.items, amount: r.amount }} />
        </>
      ) : (
        <>
          {!r.paidAt && r.method !== "robokassa" ? (
            <>
              <label>
                Дата получения денег
                <input
                  type="date"
                  value={paidDate}
                  min={marketPaymentDate(r.createdAt)}
                  max={marketPaymentDate()}
                  disabled={busy}
                  onChange={(e) => setPaidDate(e.target.value)}
                />
              </label>
              <button
                className="market-primary"
                disabled={busy || !paidDate}
                onClick={() =>
                  void run({ action: "intake-confirm", id: r.id, paidDate })
                }
              >
                Деньги получены · {r.number}
              </button>
            </>
          ) : null}
          <h3>Что купили на {money(r.amount)}</h3>
          {r.method !== "robokassa" ? (
            <div
              className="market-segmented"
              role="group"
              aria-label={`${r.number}: позиции чека`}
            >
              <button
                type="button"
                aria-pressed={customName}
                disabled={busy}
                onClick={() => setCustomName(true)}
              >
                Ввести название
              </button>
              <button
                type="button"
                aria-pressed={!customName}
                disabled={busy}
                onClick={() => setCustomName(false)}
              >
                Выбрать из каталога
              </button>
            </div>
          ) : null}
          {customName ? (
            <div className="market-intake-receipt-name">
              <label htmlFor={`receipt-name-${r.id}`}>
                Название товара для чека
              </label>
              <input
                id={`receipt-name-${r.id}`}
                type="text"
                maxLength={128}
                placeholder="Например, Ваза Roota"
                value={receiptName}
                disabled={busy}
                aria-describedby={`receipt-name-help-${r.id}`}
                aria-invalid={!!receiptName && !nameResult.success}
                onChange={(e) => setReceiptName(e.target.value)}
              />
              <p id={`receipt-name-help-${r.id}`} className="market-small">
                Одна позиция на {money(r.amount)}. Это название попадёт в чек
                ФНС. Остатки каталога не изменятся.
              </p>
              {receiptName && !nameResult.success ? (
                <p className="market-error" role="alert">
                  {nameResult.error.issues[0]?.message}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <div className="market-intake-items">
                {state.inventory
                  .filter((i) => i.price !== null)
                  .map((i) => (
                    <label key={i.key}>
                      <span>
                        {i.name} · {money(i.price!)} · осталось {i.stock_qty}
                      </span>
                      <input
                        type="number"
                        min="0"
                        max={Math.min(100, i.stock_qty)}
                        step="1"
                        aria-label={`${r.number}: ${i.name}`}
                        value={quantities[i.key] ?? 0}
                        onChange={(e) =>
                          setQuantities((v) => ({
                            ...v,
                            [i.key]: Math.max(
                              0,
                              Math.min(100, Number(e.target.value) || 0),
                            ),
                          }))
                        }
                      />
                    </label>
                  ))}
              </div>
              <label className="market-consent">
                <input
                  type="checkbox"
                  checked={gardenBundle}
                  onChange={(e) => setGardenBundle(e.target.checked)}
                />
                <span>«Сад» — набор с действующими скидками</span>
              </label>
              <p
                className={exact ? "market-intake-exact" : "market-error"}
                role="status"
              >
                {money(quote?.amount ?? 0)} / {money(r.amount)} ·{" "}
                {exact
                  ? "Сумма совпадает"
                  : "Состав должен точно совпадать с суммой покупки"}
              </p>
              {error ? <p className="market-small">{error}</p> : null}
            </>
          )}
          {r.method === "robokassa" ? (
            <p className="market-small">
              Сначала сохраняем точный состав. Затем покупатель оплачивает на
              своём телефоне; чек выдаёт Робокасса.
            </p>
          ) : !r.paidAt ? (
            <p className="market-small">
              Сформировать чек можно только после подтверждения денег.
            </p>
          ) : null}
          <button
            className="market-primary"
            disabled={busy || !ready || (!r.paidAt && r.method !== "robokassa")}
            onClick={() =>
              void run({
                action: "intake-finalize",
                id: r.id,
                basket: customName
                  ? { generic: true, name: receiptName.trim() }
                  : {
                      requestKey: crypto.randomUUID(),
                      quantities,
                      gardenBundle,
                    },
              })
            }
          >
            {r.method === "robokassa"
              ? "Сохранить состав и разрешить оплату"
              : "Сформировать чек"}
          </button>
          {!customName && r.paidAt && r.method !== "robokassa" && (
            <button
              type="button"
              className="market-secondary"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Выдать чек с позицией «${marketGoodsName}»? Остатки конкретных изделий не изменятся.`,
                  )
                )
                  void run({
                    action: "intake-finalize",
                    id: r.id,
                    basket: { generic: true },
                  });
              }}
            >
              {marketGoodsName} · без выбора изделий
            </button>
          )}
          {!r.paidAt ? (
            <button
              className="market-secondary"
              disabled={busy}
              onClick={() => void run({ action: "intake-cancel", id: r.id })}
            >
              Отменить неоплаченную покупку
            </button>
          ) : null}
        </>
      )}
    </details>
  );
}
export default function MarketIntakeQueue({ state }: { state: MarketState }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await marketFetch("/api/market/admin", body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="market-intake-queue" id="market-intake-queue">
      <h2>Покупки по постоянному QR</h2>
      <p>
        По Робокассе покупатель оплачивает введённую сумму сразу. Для наличных и
        переводов подтвердите деньги, а затем выберите позиции чека.
      </p>
      <details>
        <summary>Постоянный QR для печати и приём покупок</summary>
        <QrCode value="https://roota.moscow/market/buy" />
        <p>
          <a href="/market/buy" target="_blank" rel="noreferrer">
            roota.moscow/market/buy ↗
          </a>
        </p>
        <a className="market-secondary" href="/api/market/intake-label">
          Скачать постоянный QR · PDF 40×58
        </a>
        <p>
          {state.intakeEnabled
            ? "Приём покупок открыт"
            : "Приём покупок закрыт"}
          . Закрытие останавливает только новые заявки, сохранённые остаются
          доступными.
        </p>
        <button
          className="market-secondary"
          disabled={busy}
          onClick={() =>
            void run({ action: "intake-open", enabled: !state.intakeEnabled })
          }
        >
          {state.intakeEnabled
            ? "Закрыть приём новых покупок"
            : "Открыть приём покупок по QR"}
        </button>
      </details>
      <p>{state.intakes?.length ?? 0} покупок в очереди</p>
      {error ? (
        <p role="alert" className="market-error">
          {error}
        </p>
      ) : null}
      {state.intakes?.map((r) => (
        <RequestEditor key={r.id} r={r} state={state} run={run} busy={busy} />
      ))}
      {state.intakes?.length === 200 ? (
        <p>Показаны первые 200 покупок. После обработки появятся следующие.</p>
      ) : null}
    </section>
  );
}
