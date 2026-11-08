"use client";
import { useState } from "react";
import {
  money,
  quoteBasket,
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
    [gardenBundle, setGardenBundle] = useState(true);
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
  return (
    <details className="market-intake-order">
      <summary>
        <span>
          {r.number}
          {r.mode === "test" ? " · тест" : ""}
        </span>
        <strong>{money(r.amount)}</strong>
        <span>
          {r.saleId
            ? "Состав сохранён · ожидает оплаты"
            : r.paidAt
              ? "Оплачено · нужен состав"
              : "Ожидает подтверждения денег"}
        </span>
      </summary>
      <p>
        {r.method === "cash"
          ? "Наличные"
          : r.method === "transfer"
            ? "Прямой перевод"
            : "Робокасса"}{" "}
        · {r.email}
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
            <button
              className="market-primary"
              disabled={busy}
              onClick={() => void run({ action: "intake-confirm", id: r.id })}
            >
              Деньги получены · {r.number}
            </button>
          ) : null}
          <h3>Что купили на {money(r.amount)}</h3>
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
            disabled={busy || !exact || (!r.paidAt && r.method !== "robokassa")}
            onClick={() =>
              void run({
                action: "intake-finalize",
                id: r.id,
                basket: {
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
        Покупатели вводят сумму и почту на своих телефонах. Вы подтверждаете
        деньги, добавляете изделия на точную сумму и формируете чек. iPad
        остаётся свободным.
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
