"use client";
import { useEffect, useId, useState } from "react";
import type { AddressSuggestion } from "@/lib/address-suggestions";
import { joinCourierAddress, splitCourierAddress } from "@/lib/courier-address";

export default function CourierAddress({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (address: string) => void;
  error?: string;
}) {
  const id = useId();
  const { address, apartment } = splitCourierAddress(value);
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");
  const expanded = open && items.length > 0;

  useEffect(() => {
    if (!open || address.trim().length < 2 || address.trim().length > 300) {
      setItems([]);
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/address-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ part: "address", query: address }),
          signal: abort.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Подсказки недоступны. Продолжайте вводить адрес.",
          );
        if (!abort.signal.aborted) {
          setItems(data.suggestions);
          setActive(-1);
          setHint(
            data.suggestions.length
              ? ""
              : "Уточните адрес или введите его полностью самостоятельно.",
          );
        }
      } catch (e) {
        if (!abort.signal.aborted) {
          setItems([]);
          setHint(
            e instanceof Error
              ? e.message
              : "Подсказки недоступны. Продолжайте вводить адрес.",
          );
        }
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [address, open]);

  function choose(item: AddressSuggestion) {
    onChange(joinCourierAddress(item.value, apartment));
    setOpen(false);
    setItems([]);
    setActive(-1);
    setHint("");
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor={id}
        className="block font-body text-ui uppercase tracking-wide"
      >
        Адрес курьерской доставки *
      </label>
      <div className="relative">
        <input
          id={id}
          name="address"
          value={address}
          maxLength={450}
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="Город, улица, дом, корпус"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? `${id}-list` : undefined}
          aria-activedescendant={
            expanded && active >= 0 ? `${id}-${active}` : undefined
          }
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          aria-invalid={Boolean(error)}
          aria-busy={loading}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            const typed = splitCourierAddress(e.target.value);
            onChange(
              typed.apartment
                ? e.target.value
                : joinCourierAddress(e.target.value, apartment),
            );
            setItems([]);
            setActive(-1);
            setHint("");
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (items.length && ["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              setOpen(true);
              setActive((i) =>
                i < 0
                  ? e.key === "ArrowDown"
                    ? 0
                    : items.length - 1
                  : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                    items.length,
              );
            }
            if (e.key === "Enter" && expanded) {
              e.preventDefault();
              choose(items[active >= 0 ? active : 0]);
            }
          }}
          className="w-full border border-stone-200 bg-transparent px-4 py-4 font-body text-copy"
        />
        {expanded && (
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label="Варианты адреса"
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
                className={`cursor-pointer p-3 font-body text-copy hover:bg-stone-100 ${active === i ? "bg-stone-100" : ""}`}
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
      </div>
      <p
        id={`${id}-help`}
        role="status"
        className="font-body text-caption text-stone-500"
      >
        {open && hint
          ? hint
          : "Начните вводить адрес и выберите подходящий вариант или допишите его самостоятельно."}
      </p>
      <label htmlFor={`${id}-apartment`} className="block font-body text-ui">
        Квартира / офис
      </label>
      <input
        id={`${id}-apartment`}
        name="apartment"
        value={apartment}
        onChange={(e) => onChange(joinCourierAddress(address, e.target.value))}
        maxLength={30}
        autoComplete="address-line2"
        placeholder="Если есть"
        className="w-full border border-stone-200 bg-transparent px-4 py-4 font-body text-copy sm:max-w-64"
      />
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-caption text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
