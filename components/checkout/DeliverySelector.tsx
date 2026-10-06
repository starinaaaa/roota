"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { normalizeRussianPhone } from "@/lib/contacts";
import type { DeliveryPoint, DeliveryQuote } from "@/lib/delivery/model";
import type { DeliveryCity } from "@/lib/delivery/geo";
const PointsMap = dynamic(() => import("./PointsMap"), {
  ssr: false,
  loading: () => (
    <div className="h-80 bg-stone-100 flex items-center justify-center text-sm">
      Загружаем карту…
    </div>
  ),
});
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
    [selectedCity, setSelectedCity] = useState<DeliveryCity | null>(null),
    [suggestions, setSuggestions] = useState<DeliveryCity[]>([]),
    [suggestOpen, setSuggestOpen] = useState(false),
    [active, setActive] = useState(-1),
    [method, setMethod] = useState(false),
    [points, setPoints] = useState<DeliveryPoint[]>([]),
    [point, setPoint] = useState<DeliveryPoint | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [listLimit, setListLimit] = useState(100);
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
    setListLimit(100);
    setError("");
    setBusy(false);
    onQuoteRef.current(null);
  }
  useEffect(() => {
    const counter = revision;
    reset();
    setOpen(false);
    return () => {
      counter.current++;
      controller.current?.abort();
    };
  }, [phone, cartKey]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) {
      dialog.current.close();
      chooseButton.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    const abort = new AbortController();
    if (city.trim().length < 2 || selectedCity) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/delivery?action=cities&q=${encodeURIComponent(city.trim())}`,
          { signal: abort.signal },
        );
        const data = await r.json();
        if (!abort.signal.aborted) {
          setSuggestions(r.ok ? data.cities : []);
          setActive(-1);
        }
      } catch {
        if (!abort.signal.aborted) setSuggestions([]);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [city, selectedCity]);
  function selectCity(value: DeliveryCity) {
    reset();
    setCity(value.name);
    setSelectedCity(value);
    setSuggestOpen(false);
    setMethod(false);
  }
  async function request(action: "points" | "quote", selected?: DeliveryPoint) {
    if (!selectedCity) return;
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
      const response =
        action === "points"
          ? await fetch(
              `/api/delivery?action=catalog&q=${encodeURIComponent(selectedCity.name)}`,
              { signal: abort.signal },
            )
          : await fetch("/api/delivery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action,
                phone,
                city: selectedCity.name,
                pointId: selected?.id,
              }),
              signal: abort.signal,
            });
      const result = await response.json();
      if (version !== revision.current) return;
      if (!response.ok)
        throw new Error(result.error || "Не удалось рассчитать доставку.");
      if (action === "points") {
        setPoints(result.points);
        setListLimit(100);
      } else {
        onQuoteRef.current(result.quote);
        setOpen(false);
      }
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
  const visible = useMemo(
    () =>
      points.filter((p) =>
        (p.name + " " + p.address)
          .toLocaleLowerCase("ru")
          .includes(query.toLocaleLowerCase("ru")),
      ),
    [points, query],
  );
  function choose(p: DeliveryPoint) {
    if (!validPhone) {
      setPoint(p);
      setOpen(false);
      setError("Укажите полный номер телефона и повторите расчёт доставки.");
      return;
    }
    request("quote", p);
  }
  return (
    <fieldset className="space-y-5">
      <legend className="font-body text-[10px] tracking-[0.28em] uppercase text-stone-400 mb-6">
        Доставка
      </legend>
      <div className="space-y-2 relative">
        <label
          htmlFor="delivery-city"
          className="font-body text-[10px] tracking-[0.18em] uppercase text-stone-500 block"
        >
          Город *
        </label>
        <input
          id="delivery-city"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestOpen && suggestions.length > 0}
          aria-controls="delivery-cities"
          aria-activedescendant={
            active >= 0 && suggestOpen ? `delivery-city-${active}` : undefined
          }
          autoComplete="off"
          value={city}
          maxLength={100}
          onFocus={() => setSuggestOpen(true)}
          onBlur={() => setSuggestOpen(false)}
          onChange={(e) => {
            setCity(e.target.value);
            setSelectedCity(null);
            setSuggestOpen(true);
            setActive(-1);
            setMethod(false);
            reset();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSuggestOpen(false);
            if (!suggestions.length) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setSuggestOpen(true);
              setActive(
                (i) =>
                  (i + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) %
                  suggestions.length,
              );
            }
            if (e.key === "Enter" && suggestOpen) {
              e.preventDefault();
              selectCity(suggestions[active >= 0 ? active : 0]);
            }
          }}
          placeholder="Начните вводить название города"
          className="w-full border border-stone-200 bg-transparent font-body text-sm px-4 py-3"
        />
        {suggestOpen && suggestions.length > 0 && (
          <ul
            id="delivery-cities"
            role="listbox"
            aria-label="Города"
            className="absolute top-full left-0 right-0 z-20 border border-stone-200 bg-stone-50 shadow-lg max-h-60 overflow-y-auto"
          >
            {suggestions.map((c, i) => (
              <li
                key={c.name}
                id={`delivery-city-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCity(c)}
                className={`px-4 py-3 text-sm cursor-pointer hover:bg-stone-100 ${i === active ? "bg-stone-100" : ""}`}
              >
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      {!enabled ? (
        <p role="status" className="text-sm text-stone-500">
          Доставка временно недоступна. Свяжитесь со студией.
        </p>
      ) : selectedCity ? (
        <>
          <label
            className={`flex items-center gap-4 border px-4 py-4 cursor-pointer ${method ? "border-stone-900" : "border-stone-200"}`}
          >
            <input
              type="radio"
              name="delivery-method"
              checked={method}
              onChange={() => setMethod(true)}
              value="ozon_point"
              className="accent-stone-900"
            />
            <span className="font-body">
              <span className="block text-xs tracking-[0.12em] uppercase">
                Ozon — доставка в пункт выдачи
              </span>
              <span className="block text-xs text-stone-500 mt-2">
                Стоимость рассчитается после выбора пункта
              </span>
            </span>
          </label>
          {method && (
            <>
              <button
                ref={chooseButton}
                type="button"
                disabled={busy}
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
          )}
        </>
      ) : (
        <p className="text-xs text-stone-500">Выберите город из подсказок.</p>
      )}
      {busy && !open && (
        <p role="status" className="text-xs text-stone-500">
          Рассчитываем доставку…
        </p>
      )}
      {error && !open && (
        <div>
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
          {point && validPhone && (
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
        className="fixed inset-0 m-auto w-[calc(100%-1rem)] max-w-6xl max-h-[92dvh] overflow-y-auto bg-stone-50 text-stone-900 p-0 border border-stone-200 backdrop:bg-black/30"
      >
        <div className="p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="points-title" className="font-display text-xl md:text-2xl">
              Пункты Ozon · {selectedCity?.name}
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
            onChange={(e) => {
              setQuery(e.target.value);
              setListLimit(100);
            }}
            placeholder="Улица или название пункта"
            className="w-full border border-stone-200 bg-transparent px-4 py-3 text-sm"
          />
          <div className="grid md:grid-cols-[minmax(0,1fr)_300px] gap-4">
            {open && selectedCity && (
              <PointsMap
                city={selectedCity}
                points={visible}
                onSelect={choose}
              />
            )}
            <div className="max-h-[30dvh] md:max-h-[55dvh] overflow-y-auto space-y-2">
              <ul className="space-y-2">
                {visible.slice(0, listLimit).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => choose(p)}
                      className={`w-full text-left border p-4 hover:border-stone-500 focus-visible:border-stone-900 disabled:opacity-50 ${point?.id === p.id ? "border-stone-900" : "border-stone-200"}`}
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
                    : "Пунктов в этом городе не найдено."}
                </p>
              )}
              {visible.length > listLimit && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setListLimit((limit) => limit + 100)}
                  className="text-sm underline p-3"
                >
                  Показать ещё в списке
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-stone-500">
            На карте все пункты города: {points.length}. После выбора проверим
            доставку для вашего заказа и рассчитаем стоимость.
            {!validPhone && " Для расчёта понадобится номер телефона."}
          </p>
          {busy && (
            <p role="status" className="text-sm text-stone-500">
              {point ? "Рассчитываем доставку…" : "Загружаем пункты…"}
            </p>
          )}
          {error && (
            <div>
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  point ? request("quote", point) : request("points")
                }
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
