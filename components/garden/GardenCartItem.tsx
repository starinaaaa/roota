"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "@/components/ui/StoreImage";
import { useCart } from "@/hooks/useCart";
import {
  gardenCount,
  gardenCountLabel,
  gardenName,
  gardenPrice,
  gardenSummary,
} from "@/lib/garden";
import { formatPrice } from "@/lib/format-price";
import type { CartItem } from "@/types";
import GardenBuilder from "./GardenBuilder";

export default function GardenCartItem({ item }: { item: CartItem }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const { saveGardenItem } = useCart();
  const c = item.configuration!;
  const price = gardenPrice(c);
  return (
    <article
      className="border-b border-stone-200 py-6"
      aria-label={`Сад — ${gardenName(c)}`}
    >
      <div className="flex items-start gap-4">
        <Link
          href={`/product/${item.product.slug}`}
          className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-md bg-stone-100"
        >
          {item.product.images[0] && (
            <Image
              src={item.product.images[0]}
              alt="Керамический конструктор Сад"
              fill
              sizes="80px"
              className="object-cover"
            />
          )}
        </Link>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-display text-lg leading-snug text-stone-900">
            Сад — {gardenName(c)}
          </p>
          <p className="text-sm text-stone-600">
            {gardenCountLabel(gardenCount(c))} · {gardenSummary(c)}
          </p>
          <p className="font-body text-copy tabular-nums">
            {formatPrice(item.product.price)}
            {price.saving > 0 && (
              <span className="ml-2 text-xs text-[#526444]">
                −{price.discount}%
              </span>
            )}
          </p>
          <p className="text-xs leading-relaxed text-stone-600">
            3 недели изготовления после оплаты
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-700">
        <button
          type="button"
          disabled={pending}
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
          className="min-h-11 underline underline-offset-4 disabled:opacity-40"
        >
          {editing ? "Закрыть редактор" : "Изменить состав"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await saveGardenItem(item.product_id, c);
            })
          }
          className="min-h-11 underline underline-offset-4 disabled:opacity-40"
        >
          {pending ? "Сохраняю…" : "Повторить сад"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await saveGardenItem(item.product_id, null, item.id, "remove");
            })
          }
          className="min-h-11 text-stone-500 underline underline-offset-4 disabled:opacity-40"
        >
          Удалить
        </button>
      </div>
      {editing && (
        <div className="mt-4 rounded-lg border border-stone-200 p-3 sm:p-5">
          <GardenBuilder
            initial={c}
            saveLabel="Сохранить изменения"
            onCancel={() => setEditing(false)}
            onSave={async (config) => {
              const saved = await saveGardenItem(
                item.product_id,
                config,
                item.id,
              );
              if (saved) setEditing(false);
              return saved;
            }}
          />
        </div>
      )}
    </article>
  );
}
