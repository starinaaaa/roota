"use client";
import { productTitle } from "@/lib/product-title";

import { bindPrepositions } from "@/lib/typography";
import { useId, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { formatPrice } from "@/lib/format-price";
import type { Product } from "@/types";
import PurchaseHelp from "@/components/shop/PurchaseHelp";

type Props = {
  product: Product;
  cartQty: number;
  pending?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  onUnavailable: () => void;
  onPreorder: () => void;
};

export default function ProductInfo({
  product,
  cartQty,
  pending = false,
  onIncrement,
  onDecrement,
  onUnavailable,
  onPreorder,
}: Props) {
  const [careOpen, setCareOpen] = useState(false);
  const [craftOpen, setCraftOpen] = useState(false);

  const atStockLimit =
    product.stock_qty != null && cartQty >= product.stock_qty;

  return (
    <div className="min-w-0 flex flex-col gap-8">
      {/* Категория + название */}
      <div className="space-y-3">
        {product.category && (
          <p className="font-body text-caption tracking-[0.08em] uppercase text-stone-600">
            {bindPrepositions(product.category.name)}
          </p>
        )}
        <h1 className="font-display text-section leading-tight text-stone-900 [overflow-wrap:anywhere]">
          {bindPrepositions(productTitle(product.name, product.category))}
        </h1>
        <p className="font-body text-copy text-stone-900">
          {bindPrepositions(formatPrice(product.price))}
        </p>
      </div>

      {/* Описание */}
      {product.description && (
        <p className="font-body text-copy text-stone-800 leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
          {bindPrepositions(product.description)}
        </p>
      )}

      {/* Характеристики */}
      <ProductSpecs product={product} />

      {/* CTA */}
      <div className="flex flex-col gap-3 pt-2">
        {/* Мало на складе */}
        {product.in_stock &&
          product.stock_qty != null &&
          product.stock_qty > 0 &&
          product.stock_qty <= 3 && (
            <p className="font-body text-ui text-stone-600 -mt-1">
              {bindPrepositions(
                product.product_kind === "unique"
                  ? "Единственный экземпляр"
                  : product.stock_qty === 1
                    ? "Осталась 1 шт."
                    : `Осталось ${product.stock_qty} шт.`,
              )}
            </p>
          )}

        {product.in_stock && product.stock_qty > 0 ? (
          <>
            <AnimatePresence mode="wait">
              {cartQty > 0 ? (
                /* ── Qty counter — replaces button once item is in cart ── */
                <motion.div
                  key="counter"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="w-full flex items-center justify-between border border-stone-200 px-6 py-4"
                >
                  <span className="font-body text-caption tracking-[0.08em] uppercase text-stone-600">
                    В корзине
                  </span>

                  <div className="flex items-center gap-6">
                    <button
                      onClick={onDecrement}
                      disabled={pending}
                      className="font-body text-copy text-stone-600 hover:text-stone-900 transition-colors w-5 text-center leading-none"
                      aria-label="Уменьшить количество"
                    >
                      −
                    </button>

                    <span className="font-body text-copy text-stone-900 min-w-[1.5rem] text-center tabular-nums">
                      {cartQty}
                    </span>

                    <button
                      onClick={atStockLimit ? undefined : onIncrement}
                      disabled={pending || atStockLimit}
                      className={[
                        "font-body text-copy leading-none w-5 text-center transition-colors",
                        atStockLimit
                          ? "text-stone-200 cursor-not-allowed"
                          : "text-stone-600 hover:text-stone-900",
                      ].join(" ")}
                      aria-label="Увеличить количество"
                    >
                      +
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* ── Add to cart button ── */
                <motion.button
                  key="add"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  onClick={onIncrement}
                  disabled={pending}
                  aria-busy={pending}
                  className="w-full bg-stone-900 text-stone-50 font-body text-ui tracking-[0.08em] uppercase py-4 px-8 hover:bg-stone-700 transition-colors duration-300"
                >
                  {pending ? "Добавляю…" : "Добавить в корзину"}
                </motion.button>
              )}
            </AnimatePresence>

            {atStockLimit && cartQty > 0 && (
              <p className="font-body text-caption tracking-[0.08em] uppercase text-stone-600 text-center -mt-1">
                Максимум в наличии
              </p>
            )}

            <Link
              href="/contacts"
              className="store-control text-center
              w-full border border-stone-300 text-stone-700
              font-body text-ui tracking-[0.08em] uppercase
              py-4 px-8
              hover:bg-stone-900 hover:text-stone-50 hover:border-stone-900
              transition-all duration-300
            "
            >
              Связаться со студией
            </Link>
          </>
        ) : (
          <>
            <button
              disabled
              className="
                w-full border border-stone-200 text-stone-300
                font-body text-ui tracking-[0.08em] uppercase
                py-4 px-8 cursor-not-allowed
              "
            >
              Скоро в наличии
            </button>
            <button
              onClick={onUnavailable}
              className="
              w-full border border-stone-300 text-stone-700
              font-body text-ui tracking-[0.08em] uppercase
              py-4 px-8
              hover:bg-stone-900 hover:text-stone-50 hover:border-stone-900
              transition-all duration-300
            "
            >
              Уведомить о поступлении
            </button>
            {product.preorder_enabled && product.lead_time_days && (
              <button className="admin-secondary" onClick={onPreorder}>
                Предзаказ · изготовление {product.lead_time_days} дней
              </button>
            )}
          </>
        )}
      </div>

      <PurchaseHelp />

      {/* Разделитель */}
      <div className="divider" />

      {/* Уход за изделием — аккордеон */}
      <Accordion
        label="Уход за изделием"
        open={careOpen}
        onToggle={() => setCareOpen((v) => !v)}
      >
        {bindPrepositions(
          product.care ||
            "Избегайте резких перепадов температур. Допустимые способы использования указаны в характеристиках изделия.",
        )}
      </Accordion>

      {/* Ручная работа */}
      <Accordion
        label="Ручная работа"
        open={craftOpen}
        onToggle={() => setCraftOpen((v) => !v)}
      >
        Каждое изделие создаётся вручную. Небольшие различия формы, оттенка и
        рисунка могут быть частью ручной работы, если они соответствуют описанию
        и не мешают безопасному использованию. Трещины, сколы и другие
        недостатки не относятся к допустимым особенностям.
      </Accordion>
    </div>
  );
}

/* ── ProductSpecs ───────────────────────────────────────────────────────────── */
function ProductSpecs({ product }: { product: Product }) {
  const rows: { label: string; value: string }[] = [];

  if (product.material != null && product.material !== "")
    rows.push({ label: "Материал", value: product.material });
  if (product.dimensions != null && product.dimensions !== "")
    rows.push({ label: "Размер", value: product.dimensions });
  if (product.capacity_ml != null)
    rows.push({ label: "Объём", value: `${product.capacity_ml} мл` });
  if (product.weight != null && product.weight !== "")
    rows.push({ label: "Вес", value: product.weight });
  if (product.dishwasher_safe != null)
    rows.push({
      label: "Посудомоечная машина",
      value: product.dishwasher_safe ? "Можно" : "Нельзя",
    });
  if (product.microwave_safe != null)
    rows.push({
      label: "Микроволновая печь",
      value: product.microwave_safe ? "Можно" : "Нельзя",
    });

  if (rows.length === 0) return null;

  return (
    <div>
      <dl className="divide-y divide-stone-200">
        {rows.map(({ label, value }) => (
          <div
            key={label}
            className="grid grid-cols-1 min-[480px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-x-6 gap-y-2 py-4"
          >
            <dt className="font-body text-ui uppercase tracking-[0.08em] text-stone-600 [overflow-wrap:anywhere]">
              {bindPrepositions(label)}
            </dt>
            <dd className="font-body text-ui text-stone-700 whitespace-pre-wrap [overflow-wrap:anywhere] min-[480px]:text-right">
              {bindPrepositions(value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="font-body text-caption text-stone-600 italic mt-4">
        Каждое изделие немного отличается — это часть ручной работы
      </p>
    </div>
  );
}

/* ── Accordion ─────────────────────────────────────────────────────────────── */
function Accordion({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        id={`${panelId}-trigger`}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="group flex w-full items-center justify-between py-1 active:scale-100"
      >
        <span className="font-body text-ui tracking-[0.08em] uppercase text-stone-600 group-hover:text-stone-900 transition-colors duration-200">
          {bindPrepositions(label)}
        </span>
        <span
          aria-hidden="true"
          className={`font-body text-copy leading-none text-stone-800 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-45" : "rotate-0"}`}
        >
          +
        </span>
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={`${panelId}-trigger`}
        aria-hidden={!open}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="whitespace-pre-wrap pb-1 pt-3 font-body text-copy leading-relaxed text-stone-800 [overflow-wrap:anywhere]">
            {children}
          </p>
        </div>
      </div>

      <div className="divider mt-4" />
    </div>
  );
}
