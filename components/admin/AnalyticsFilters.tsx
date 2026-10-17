"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function AnalyticsFilters({
  days,
  product,
  products,
}: {
  days: number;
  product: string;
  products: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap gap-3 items-end"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        const params = new URLSearchParams({ days: String(data.get("days")) });
        const selected = String(data.get("product") ?? "");
        if (selected) params.set("product", selected);
        start(() =>
          router.push(`/admin/analytics?${params}`, { scroll: false }),
        );
      }}
    >
      <label>
        Период
        <select
          name="days"
          className="admin-input"
          defaultValue={days}
          disabled={pending}
        >
          {[7, 30, 90].map((d) => (
            <option key={d} value={d}>
              {d} дней
            </option>
          ))}
        </select>
      </label>
      <label className="w-full sm:w-auto sm:max-w-md">
        Товар
        <select
          name="product"
          className="admin-input"
          defaultValue={product}
          disabled={pending}
        >
          <option value="">Все товары</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="admin-secondary"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "Загружаю…" : "Показать"}
      </button>
    </form>
  );
}
