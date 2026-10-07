"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, X } from "lucide-react";
import { formatPrice } from "@/lib/products";
import type { CartItem } from "@/types";

type Props = {
  item: CartItem;
  compact?: boolean; // компактный вид для drawer
  onUpdate: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
};

export default function CartLineItem({
  item,
  compact = false,
  onUpdate,
  onRemove,
}: Props) {
  const { product, quantity } = item;
  const imgSrc = product.images?.[0] ?? null;

  // Disable + when cart already holds every available unit
  const atStockLimit =
    item.purchase_mode !== "preorder" &&
    product.stock_qty != null &&
    quantity >= product.stock_qty;

  if (compact) {
    return (
      // py-6→py-9 (×1.5), gap-5→gap-8 (×1.5)
      <div className="flex gap-4 sm:gap-8 py-6 sm:py-9 border-b border-stone-100 last:border-b-0">
        {/* Фото — 72px→108px (×1.5) */}
        <Link href={`/product/${product.slug}`} className="shrink-0">
          <div className="relative w-20 h-20 sm:w-[108px] sm:h-[108px] bg-stone-100 overflow-hidden">
            {imgSrc && (
              <Image
                src={imgSrc}
                alt={product.name}
                fill
                className="object-cover"
                sizes="108px"
              />
            )}
          </div>
        </Link>

        {/* Инфо — gap-3→gap-5 (×1.5) */}
        <div className="flex flex-col flex-1 min-w-0 gap-5">
          {/* Строка: название + цена — text ×1.5 */}
          <div className="flex flex-col sm:flex-row items-start justify-between gap-2 sm:gap-4">
            <Link
              href={`/product/${product.slug}`}
              className="font-body text-copy tracking-[0.08em] uppercase text-stone-700 leading-snug hover:text-stone-600 transition-colors duration-200 line-clamp-2"
            >
              {product.name}
            </Link>
            <span className="font-body text-price tracking-[0.06em] text-stone-900 shrink-0 tabular-nums">
              {formatPrice(product.price * quantity)}
            </span>
          </div>
          {item.purchase_mode === "preorder" && (
            <p className="text-caption">Предзаказ · {product.lead_time_days} дней</p>
          )}

          {/* Строка: степпер + удалить — text ×1.5 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 sm:gap-3">
              <button
                onClick={() => onUpdate(product.id, quantity - 1)}
                className="p-2 min-w-9 min-h-9 font-body text-ui text-stone-600 hover:text-stone-800 transition-colors leading-none"
                aria-label="Уменьшить"
              >
                —
              </button>
              <span className="font-body text-ui whitespace-nowrap tracking-[0.06em] text-stone-600 tabular-nums">
                [ {quantity} ] шт.
              </span>
              <button
                onClick={() =>
                  !atStockLimit && onUpdate(product.id, quantity + 1)
                }
                disabled={atStockLimit}
                className={[
                  "p-2 min-w-9 min-h-9 font-body text-price leading-none transition-colors",
                  atStockLimit
                    ? "text-stone-200 cursor-not-allowed"
                    : "text-stone-600 hover:text-stone-800",
                ].join(" ")}
                aria-label="Увеличить"
              >
                +
              </button>
              {atStockLimit && (
                <span className="font-body text-caption tracking-[0.08em] uppercase text-stone-600">
                  макс.
                </span>
              )}
            </div>

            <button
              onClick={() => onRemove(product.id)}
              className="font-body text-caption sm:text-ui tracking-[0.1em] uppercase text-stone-600 hover:text-stone-700 transition-colors duration-150"
              aria-label="Удалить"
            >
              •удалить•
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Полный вид (страница /cart) ──────────────────────────────────────────────
  return (
    <div className="flex gap-5 md:gap-7 py-7 border-b border-stone-100 last:border-b-0">
      {/* Фото */}
      <Link href={`/product/${product.slug}`} className="shrink-0">
        <div className="relative w-24 h-32 md:w-28 md:h-36 bg-stone-100 overflow-hidden">
          {imgSrc && (
            <Image
              src={imgSrc}
              alt={product.name}
              fill
              className="object-cover hover:scale-[1.03] transition-transform duration-500"
              sizes="(max-width: 768px) 96px, 112px"
            />
          )}
        </div>
      </Link>

      {/* Инфо */}
      <div className="flex flex-col flex-1 min-w-0 gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              href={`/product/${product.slug}`}
              className="font-body text-ui text-stone-800 hover:text-stone-600 transition-colors duration-200"
            >
              {product.name}
            </Link>
            <p className="font-display text-copy text-stone-900 mt-1">
              {formatPrice(product.price)}
            </p>
          </div>
          <button
            onClick={() => onRemove(product.id)}
            className="p-1 text-stone-600 hover:text-stone-700 transition-colors duration-200"
            aria-label="Удалить из корзины"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* Stepper + итого */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-auto">
          <div className="flex flex-col items-start gap-1.5">
            <div className="flex items-center gap-0 border border-stone-200">
              <button
                onClick={() => onUpdate(product.id, quantity - 1)}
                className="w-8 h-8 flex items-center justify-center text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors duration-150"
                aria-label="Уменьшить"
              >
                <Minus size={11} strokeWidth={1.5} />
              </button>
              <span className="w-8 h-8 flex items-center justify-center font-body text-caption text-stone-700 border-x border-stone-200">
                {quantity}
              </span>
              <button
                onClick={() =>
                  !atStockLimit && onUpdate(product.id, quantity + 1)
                }
                disabled={atStockLimit}
                className={[
                  "w-8 h-8 flex items-center justify-center transition-colors duration-150",
                  atStockLimit
                    ? "text-stone-200 cursor-not-allowed"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-100",
                ].join(" ")}
                aria-label="Увеличить"
              >
                <Plus size={11} strokeWidth={1.5} />
              </button>
            </div>
            {atStockLimit && (
              <span className="font-body text-caption tracking-[0.12em] uppercase text-stone-600">
                Макс. в наличии
              </span>
            )}
          </div>

          <p className="font-display text-price text-stone-900">
            {formatPrice(product.price * quantity)}
          </p>
        </div>
      </div>
    </div>
  );
}
