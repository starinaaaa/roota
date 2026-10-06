"use client";
import { useEffect, useRef, useState } from "react";
import { normalizeRussianPhone } from "@/lib/contacts";
import type { DeliveryPoint, DeliveryQuote } from "@/lib/delivery/model";
type Props = {
  phone: string;
  cartKey: string;
  enabled: boolean;
  onQuote: (quote: DeliveryQuote | null) => void;
};
export default function DeliverySelector({
  phone,
  cartKey,
  enabled,
  onQuote,
}: Props) {
  const [city, setCity] = useState(""),
    [points, setPoints] = useState<DeliveryPoint[]>([]),
    [point, setPoint] = useState<DeliveryPoint | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [nextOffset, setNextOffset] = useState<number | null>(null),
    [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    controller = useRef<AbortController | null>(null),
    revision = useRef(0),
    onQuoteRef = useRef(onQuote),
    chooseButton = useRef<HTMLButtonElement>(null);
  onQuoteRef.current = onQuote;
  function reset() {
    revision.current++;
    controller.current?.abort();
    setPoint(null);
    setPoints([]);
    setNextOffset(null);
    setError("");
    setBusy(false);
    onQuoteRef.current(null);
  }
  useEffect(() => {
    const counter = revision;
    reset();
    return () => {
      counter.current++;
      controller.current?.abort();
    };
  }, [phone, cartKey]); // selection is bound to the current recipient and cart
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current.close();
      chooseButton.current?.focus();
    }
  }, [open]);
  async function request(
    action: "points" | "quote",
    selected?: DeliveryPoint,
    offset = 0,
  ) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const version = ++revision.current;
    setBusy(true);
    setError("");
    if (action === "quote") {
      setPoint(selected!);
      onQuoteRef.current(null);
    }
    try {
      const response = await fetch("/api/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          phone,
          city: city.trim(),
          pointId: selected?.id,
          offset,
        }),
        signal: abort.signal,
      });
      const result = await response.json();
      if (version !== revision.current) return;
      if (!response.ok)
        throw new Error(result.error || "Не удалось рассчитать доставку.");
      if (action === "points") {
        setPoints((prev) =>
          offset ? [...prev, ...result.points] : result.points,
        );
        setNextOffset(result.nextOffset);
      } else onQuoteRef.current(result.quote);
    } catch (e) {
      if (version === revision.current && !abort.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Не удалось рассчитать доставку.",
        );
    } finally {
      if (version === revision.current) setBusy(false);
    }
  }
  const validPhone = Boolean(normalizeRussianPhone(phone));
  const visible = points.filter((p) =>
    (p.name + " " + p.address)
      .toLocaleLowerCase("ru")
      .includes(query.toLocaleLowerCase("ru")),
  );
  return (
    <fieldset className="space-y-5">
      <legend className="font-body text-[10px] tracking-[0.28em] uppercase text-stone-400 mb-6">
        Доставка
      </legend>
      <div className="space-y-2">
        <label
          htmlFor="delivery-city"
          className="font-body text-[10px] tracking-[0.18em] uppercase text-stone-500 block"
        >
          Город *
        </label>
        <input
          id="delivery-city"
          autoComplete="address-level2"
          value={city}
          maxLength={100}
          onChange={(e) => {
            setCity(e.target.value);
            reset();
          }}
          placeholder="Например, Москва"
          className="w-full border border-stone-200 bg-transparent font-body text-sm px-4 py-3"
        />
      </div>
      {!enabled ? (
        <p role="status" className="font-body text-sm text-stone-500">
          Доставка временно недоступна. Свяжитесь со студией.
        </p>
      ) : city.trim().length >= 2 ? (
        <>
          <div className="border border-stone-200 px-4 py-4 font-body">
            <p className="text-xs tracking-[0.12em] uppercase">
              В пункт выдачи
            </p>
            <p className="text-sm text-stone-500 mt-1">Ozon Доставка</p>
          </div>
          {!validPhone && (
            <p className="text-xs text-stone-500">
              Укажите полный номер телефона, чтобы проверить доставку.
            </p>
          )}
          <button
            ref={chooseButton}
            type="button"
            disabled={!validPhone || busy}
            onClick={() => {
              setOpen(true);
              setQuery("");
              request("points");
            }}
            className="font-body text-xs uppercase tracking-[0.12em] border border-stone-300 px-5 py-3 disabled:opacity-50"
          >
            {point ? "Изменить пункт" : "Выбрать пункт выдачи"}
          </button>
          {point && (
            <div className="font-body text-sm space-y-1">
              <p>{point.name}</p>
              <p className="text-stone-500">{point.address}</p>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-stone-500">
          Введите город, чтобы выбрать способ получения.
        </p>
      )}
      <p
        role="status"
        aria-live="polite"
        className="font-body text-xs text-stone-500"
      >
        {busy && !open ? "Рассчитываем доставку…" : ""}
      </p>
      {error && !open && (
        <div>
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
          {point && (
            <button
              type="button"
              onClick={() => request("quote", point)}
              className="text-xs underline mt-2"
            >
              Повторить расчёт
            </button>
          )}
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        aria-labelledby="points-title"
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-xl max-h-[85dvh] overflow-hidden bg-stone-50 text-stone-900 p-0 border border-stone-200 backdrop:bg-black/30"
      >
        <div className="p-5 md:p-7 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="points-title" className="font-display text-2xl">
              Пункты выдачи · {city}
            </h2>
            <button
              type="button"
              aria-label="Закрыть выбор пункта"
              onClick={() => setOpen(false)}
              className="p-2"
            >
              ✕
            </button>
          </div>
          <input
            aria-label="Поиск пункта по адресу"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Улица или название пункта"
            className="w-full border border-stone-200 bg-transparent px-4 py-3 text-sm"
          />
          <div className="max-h-[50dvh] overflow-y-auto space-y-2">
            <ul className="space-y-2">
              {visible.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      request("quote", p);
                    }}
                    className="w-full text-left border border-stone-200 p-4 hover:border-stone-500 focus-visible:border-stone-900"
                  >
                    <span className="block text-sm">{p.name}</span>
                    <span className="block text-xs text-stone-500 mt-1">
                      {p.address}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!busy && !visible.length && !error && (
              <p role="status" className="text-sm text-stone-500">
                {points.length
                  ? "По этому адресу пунктов не найдено."
                  : "Доступных пунктов не найдено. Уточните город или попробуйте позже."}
              </p>
            )}
            {nextOffset !== null && (
              <button
                type="button"
                disabled={busy}
                onClick={() => request("points", undefined, nextOffset)}
                className="text-sm underline p-3"
              >
                Показать ещё
              </button>
            )}
          </div>
          {busy && (
            <p role="status" className="text-sm text-stone-500">
              Проверяем доступные пункты…
            </p>
          )}
          {error && (
            <div>
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
              <button
                type="button"
                onClick={() => request("points")}
                className="text-sm underline mt-2"
              >
                Повторить
              </button>
            </div>
          )}
        </div>
      </dialog>
    </fieldset>
  );
}
