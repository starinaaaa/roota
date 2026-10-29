"use client";
import { useEffect, useId, useState } from "react";
import type {
  AddressSuggestion,
  AddressLocation,
} from "@/lib/address-suggestions";
function SuggestField({
  part,
  label,
  parent,
  disabled,
  selected,
  onSelect,
  onEdit,
}: {
  part: "city" | "street" | "house";
  label: string;
  parent?: AddressLocation;
  disabled?: boolean;
  selected: string;
  onSelect: (value: AddressSuggestion) => void;
  onEdit: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState(selected),
    [items, setItems] = useState<AddressSuggestion[]>([]),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [error, setError] = useState("");
  const parentKey = JSON.stringify(parent);
  useEffect(() => {
    if (!open || disabled || query.trim().length < (part === "house" ? 1 : 2)) {
      setItems([]);
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/address-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            part,
            query,
            parent: JSON.parse(parentKey || "null") ?? undefined,
          }),
          signal: abort.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Подсказки недоступны");
        if (!abort.signal.aborted) {
          setItems(data.suggestions);
          setActive(-1);
          setError(
            data.suggestions.length
              ? ""
              : "Адрес не найден в справочнике. Уточните ввод или введите адрес вручную.",
          );
        }
      } catch (e) {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : "Подсказки недоступны");
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [part, query, parentKey, disabled, open]);
  function choose(item: AddressSuggestion) {
    setQuery(item.value);
    setOpen(false);
    setItems([]);
    setError("");
    onSelect(item);
  }
  return (
    <div className="relative space-y-2">
      <label htmlFor={id} className="font-body text-ui">
        {label}
      </label>
      <input
        id={id}
        value={query}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && items.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        aria-describedby={error ? `${id}-help` : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setItems([]);
          setOpen(true);
          setError("");
          onEdit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (items.length && ["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
            setActive(
              (i) =>
                (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length,
            );
          }
          if (e.key === "Enter" && open && items.length) {
            e.preventDefault();
            choose(items[active >= 0 ? active : 0]);
          }
        }}
        className="w-full border border-stone-200 bg-transparent px-4 py-4 font-body text-copy disabled:opacity-40"
      />
      {open && items.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 max-h-72 overflow-y-auto border border-stone-200 bg-white shadow-lg"
        >
          {items.map((item, i) => (
            <li
              key={item.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={active === i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(item)}
              className={`cursor-pointer p-3 hover:bg-stone-100 ${active === i ? "bg-stone-100" : ""}`}
            >
              {item.value}
            </li>
          ))}
          <li role="presentation" className="p-2 text-caption text-stone-500">
            <a
              href="https://dadata.ru"
              target="_blank"
              rel="noopener noreferrer"
              onMouseDown={(e) => e.preventDefault()}
            >
              Подсказки DaData
            </a>
          </li>
        </ul>
      )}
      {error && (
        <p
          id={`${id}-help`}
          role="status"
          className="text-caption text-stone-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}
export default function CourierAddress({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (address: string) => void;
  error?: string;
}) {
  const [manual, setManual] = useState(Boolean(value)),
    [city, setCity] = useState<AddressSuggestion | null>(null),
    [street, setStreet] = useState<AddressSuggestion | null>(null),
    [house, setHouse] = useState<AddressSuggestion | null>(null),
    [flat, setFlat] = useState("");
  const [cityVersion, setCityVersion] = useState(0),
    [streetVersion, setStreetVersion] = useState(0);
  function update(next: AddressSuggestion | null, apartment = flat) {
    onChange(
      next
        ? `${next.value}${apartment.trim() ? `, кв. ${apartment.trim()}` : ""}`
        : "",
    );
  }
  return (
    <div className="space-y-3">
      <p className="font-body text-ui uppercase tracking-wide">
        Адрес курьерской доставки *
      </p>
      {manual ? (
        <label className="block">
          <span className="sr-only">Город, улица, дом, квартира</span>
          <input
            name="address"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={500}
            required
            autoComplete="street-address"
            placeholder="Город, улица, дом, квартира"
            className="w-full border border-stone-200 bg-transparent px-4 py-4 font-body text-copy"
          />
        </label>
      ) : (
        <>
          <SuggestField
            part="city"
            label="Город"
            selected={city?.value ?? ""}
            onEdit={() => {
              setCity(null);
              setStreet(null);
              setHouse(null);
              setCityVersion((i) => i + 1);
              setStreetVersion((i) => i + 1);
              update(null);
            }}
            onSelect={(v) => {
              setCity(v);
              setStreet(null);
              setHouse(null);
              setCityVersion((i) => i + 1);
              setStreetVersion((i) => i + 1);
              update(null);
            }}
          />
          <SuggestField
            key={`street-${cityVersion}`}
            part="street"
            label="Улица"
            selected=""
            parent={city?.location}
            disabled={!city}
            onEdit={() => {
              setStreet(null);
              setHouse(null);
              setStreetVersion((i) => i + 1);
              update(null);
            }}
            onSelect={(v) => {
              setStreet(v);
              setHouse(null);
              setStreetVersion((i) => i + 1);
              update(null);
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <SuggestField
              key={`house-${streetVersion}`}
              part="house"
              label="Дом, корпус"
              selected=""
              parent={street?.location}
              disabled={!street}
              onEdit={() => {
                setHouse(null);
                update(null);
              }}
              onSelect={(v) => {
                setHouse(v);
                update(v);
              }}
            />
            <label className="space-y-2 font-body text-ui">
              Квартира
              <input
                value={flat}
                onChange={(e) => {
                  setFlat(e.target.value);
                  update(house, e.target.value);
                }}
                maxLength={30}
                autoComplete="address-line2"
                className="w-full border border-stone-200 bg-transparent px-4 py-4 font-body text-copy"
              />
            </label>
          </div>
          <p className="text-caption text-stone-500">
            Выберите адрес дома из списка. Квартиру введите самостоятельно.
            Подсказки —{" "}
            <a
              href="https://dadata.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              DaData
            </a>
            .
          </p>
        </>
      )}
      <button
        type="button"
        className="text-caption underline text-stone-600"
        onClick={() => {
          if (manual) {
            onChange("");
            setCity(null);
            setStreet(null);
            setHouse(null);
            setFlat("");
            setCityVersion((i) => i + 1);
            setStreetVersion((i) => i + 1);
          }
          setManual((v) => !v);
        }}
      >
        {manual ? "Выбрать адрес с подсказками" : "Ввести адрес вручную"}
      </button>
      {error && (
        <p role="alert" className="text-caption text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
