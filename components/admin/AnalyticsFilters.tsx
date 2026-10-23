"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excludeMyAnalytics } from "@/lib/actions/analytics";

export default function AnalyticsFilters({
  days,
  selected,
  products,
  startDate,
  endDate,
  excluded,
}: {
  days: number;
  selected: string[];
  products: { id: string; name: string }[];
  startDate: string;
  endDate: string;
  excluded: boolean;
}) {
  const [pending, start] = useTransition();
  const [period, setPeriod] = useState(startDate ? "custom" : String(days));
  const [chosen, setChosen] = useState(selected);
  const [from, setFrom] = useState(startDate);
  const [to, setTo] = useState(endDate);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-3 items-end"
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          if (period === "custom" && (!from || !to || from > to)) {
            setError(
              "Укажите начало и конец периода. Конец не может быть раньше начала.",
            );
            return;
          }
          setError("");
          const params = new URLSearchParams();
          if (period === "custom") {
            params.set("start", from);
            params.set("end", to);
          } else params.set("days", period);
          chosen.forEach((id) => params.append("product", id));
          start(() =>
            router.push(`/admin/analytics?${params}`, { scroll: false }),
          );
        }}
      >
        <label>
          Период
          <select
            className="admin-input"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={pending}
          >
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} дней
              </option>
            ))}
            <option value="custom">Выбрать даты</option>
          </select>
        </label>
        {period === "custom" && (
          <>
            <label>
              С
              <input
                className="admin-input"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                max={to || undefined}
                required
                disabled={pending}
              />
            </label>
            <label>
              По включительно
              <input
                className="admin-input"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                min={from || undefined}
                required
                disabled={pending}
              />
            </label>
          </>
        )}
        <fieldset className="w-full sm:w-auto" disabled={pending}>
          <legend>Товары</legend>
          <details className="relative">
            <summary className="admin-input cursor-pointer">
              {chosen.length
                ? `Выбрано товаров: ${chosen.length}`
                : "Все товары"}
            </summary>
            <div className="absolute z-10 mt-1 min-w-64 max-h-72 overflow-y-auto rounded border border-stone-200 bg-white p-3 shadow-lg space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!chosen.length}
                  onChange={() => setChosen([])}
                />
                Все товары
              </label>
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={chosen.includes(p.id)}
                    onChange={(e) =>
                      setChosen(
                        e.target.checked
                          ? [...chosen, p.id]
                          : chosen.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </details>
        </fieldset>
        <button className="admin-secondary" disabled={pending}>
          {pending ? "Загружаю…" : "Показать"}
        </button>
      </form>
      <p className="text-sm text-stone-600">
        Даты — по московскому времени, оба дня включительно. События хранятся 90
        дней.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="admin-secondary"
          disabled={pending || excluded}
          onClick={() =>
            start(async () => {
              try {
                const result = await excludeMyAnalytics();
                setError(result.error);
              } catch {
                setError("Не удалось исключить браузер. Попробуйте ещё раз.");
              }
            })
          }
        >
          {excluded ? "Ваш браузер исключён" : "Не учитывать мой браузер"}
        </button>
        <p className="text-sm text-stone-600">
          Исключает прошлые события текущего браузера и следующие посещения. На
          другом устройстве включите отдельно.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
