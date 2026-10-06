"use client";
import { useRef } from "react";
import { formatRussianPhone, normalizeRussianPhone } from "@/lib/contacts";
type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  onInvalidPaste: (message: string) => void;
};
export default function PhoneField({
  value,
  onChange,
  onBlur,
  error,
  onInvalidPaste,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const national = value.replace(/\D/g, "").replace(/^7/, "");
  function commit(digits: string, count: number) {
    const formatted = formatRussianPhone(digits);
    onChange(formatted);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el || document.activeElement !== el) return;
      let seen = 0,
        pos = 2;
      for (let i = 2; i < formatted.length; i++)
        if (/\d/.test(formatted[i])) {
          seen++;
          pos = i + 1;
          if (seen >= count) break;
        }
      if (count === 0) pos = formatted.indexOf("(") + 1 || 2;
      el.setSelectionRange(pos, pos);
    });
  }
  return (
    <div className="space-y-2">
      <label
        htmlFor="phone"
        className="font-body text-[10px] tracking-[0.18em] uppercase text-stone-500 block"
      >
        Телефон *
      </label>
      <input
        ref={input}
        id="phone"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={value || "+7"}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "phone-error" : "phone-hint"}
        onBlur={onBlur}
        onChange={(e) => {
          const raw = e.target.value;
          const complete = normalizeRussianPhone(raw);
          if (complete) {
            const count = raw.startsWith("+7")
              ? Math.max(
                  0,
                  raw
                    .slice(0, e.target.selectionStart ?? raw.length)
                    .replace(/\D/g, "").length - 1,
                )
              : 10;
            commit(complete.slice(2), count);
            return;
          }
          let d = raw.replace(/\D/g, "");
          if (raw.startsWith("+7")) d = d.slice(1);
          if (d.length > 10 || /[^+\d\s()\-]/.test(raw)) return;
          const before = raw
            .slice(0, e.target.selectionStart ?? raw.length)
            .replace(/\D/g, "");
          commit(
            d,
            Math.max(0, before.length - (raw.startsWith("+7") ? 1 : 0)),
          );
        }}
        onPaste={(e) => {
          e.preventDefault();
          const raw = e.clipboardData.getData("text");
          const complete = normalizeRussianPhone(raw);
          if (complete) {
            commit(complete.slice(2), 10);
            return;
          }
          const digits = raw.replace(/\D/g, "");
          const el = e.currentTarget,
            start = el.selectionStart ?? 0,
            end = el.selectionEnd ?? start;
          const before = el.value.slice(2, start).replace(/\D/g, "").length,
            selected = el.value
              .slice(Math.max(2, start), end)
              .replace(/\D/g, "").length;
          if (
            !raw.includes("+") &&
            /^[\d\s()\-]+$/.test(raw) &&
            digits.length <= 10 &&
            national.length - selected + digits.length <= 10
          ) {
            commit(
              national.slice(0, before) +
                digits +
                national.slice(before + selected),
              before + digits.length,
            );
            return;
          }
          onInvalidPaste("Вставьте российский номер: +7 и 10 цифр.");
        }}
        onKeyDown={(e) => {
          if (e.key !== "Backspace" && e.key !== "Delete") return;
          const el = e.currentTarget,
            start = el.selectionStart ?? 0,
            end = el.selectionEnd ?? start;
          e.preventDefault();
          const before = el.value.slice(2, start).replace(/\D/g, "").length,
            selected = el.value
              .slice(Math.max(2, start), end)
              .replace(/\D/g, "").length;
          let from = before,
            to = before + selected;
          if (!selected) {
            if (e.key === "Backspace") from = Math.max(0, before - 1);
            else to = Math.min(national.length, before + 1);
          }
          commit(national.slice(0, from) + national.slice(to), from);
        }}
        className="w-full border border-stone-200 bg-transparent font-body text-sm text-stone-800 px-4 py-3 focus:outline-none focus:border-stone-500"
      />
      {error ? (
        <p id="phone-error" role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : (
        <p id="phone-hint" className="text-[10px] text-stone-400">
          Номер должен быть привязан к аккаунту выбранной службы доставки
        </p>
      )}
    </div>
  );
}
