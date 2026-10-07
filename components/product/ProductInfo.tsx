"use client";

import { bindPrepositions } from "@/lib/typography";
import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { formatPrice } from "@/lib/products";
import type { Product } from "@/types";

type Props = {
  product: Product;
  cartQty: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onUnavailable: () => void;
  onPreorder: () => void;
};

export default function ProductInfo({
  product,
  cartQty,
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
    <div className="flex flex-col gap-8">
      {/* Категория + название */}
      <div className="space-y-3">
        {product.category && (
          <p className="font-body text-caption tracking-[0.08em] uppercase text-stone-600">
            {bindPrepositions(product.category.name)}
          </p>
        )}
        <h1 className="font-display text-section leading-tight text-stone-900">
          {bindPrepositions(product.name)}
        </h1>
        <p className="font-body text-copy text-stone-900">
          {bindPrepositions(formatPrice(product.price))}
        </p>
      </div>

      {/* Описание */}
      {product.description && (
        <p className="font-body text-copy text-stone-800 leading-relaxed max-w-sm">
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
                product.stock_qty === 1
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
                      disabled={atStockLimit}
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
                  className="w-full bg-stone-900 text-stone-50 font-body text-ui tracking-[0.08em] uppercase py-4 px-8 hover:bg-stone-700 transition-colors duration-300"
                >
                  Добавить в корзину
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
              className="text-center
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
        Каждое изделие создаётся вручную — след инструментов и пальцев мастера
        остаётся в форме. Незначительные отличия в размере и оттенке — часть
        характера авторской керамики, а не дефект.
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
    <div className="mt-6 mb-6">
      <div className="divide-y divide-stone-100">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between py-3">
            <span className="font-body text-ui uppercase tracking-[0.08em] text-stone-600">
              {bindPrepositions(label)}
            </span>
            <span className="font-body text-ui text-stone-700">
              {bindPrepositions(value)}
            </span>
          </div>
        ))}
      </div>
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
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-1 group"
      >
        <span className="font-body text-ui tracking-[0.08em] uppercase text-stone-600 group-hover:text-stone-900 transition-colors duration-200">
          {bindPrepositions(label)}
        </span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.22 }}
          className="font-body text-copy text-stone-800 leading-none"
        >
          +
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden font-body text-copy text-stone-800 leading-relaxed pt-3 pb-1"
          >
            {children}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="divider mt-4" />
    </div>
  );
}
