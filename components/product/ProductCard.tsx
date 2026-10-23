"use client";

import { productBadge } from "@/lib/product-badge";
import { bindPrepositions } from "@/lib/typography";
import { useState } from "react";
import Link from "next/link";
import Image from "@/components/ui/StoreImage";
import { motion } from "framer-motion";
import { formatPrice } from "@/lib/format-price";
import CardActions from "./CardActions";
import type { Product } from "@/types";

type Props = {
  product: Product;
  index?: number;
};

export default function ProductCard({ product, index = 0 }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const imgSrc = product.primary_image_url ?? null;
  const hasImage = Boolean(imgSrc) && !imageFailed;

  return (
    <motion.article
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay: Math.min(index, 3) * 0.03,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="h-full flex flex-col"
    >
      {/* Link wraps only image + info — CardActions sits outside to avoid nested <a> */}
      <Link
        href={`/product/${product.slug}`}
        className="product-card-link group flex flex-col flex-1"
      >
        {/* Изображение */}
        <div className="relative mb-5 aspect-square overflow-hidden rounded-lg bg-stone-100">
          {hasImage ? (
            <Image
              src={imgSrc!}
              alt={product.name}
              fill
              sizes="(max-width: 639px) calc(100vw - 48px), (max-width: 767px) calc(50vw - 36px), (max-width: 1023px) calc(50vw - 60px), (max-width: 1279px) calc(50vw - 80px), (max-width: 1567px) calc(33vw - 64px), 459px"
              loading={index < 3 ? "eager" : "lazy"}
              className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04] motion-safe:group-focus-visible:scale-[1.04] motion-reduce:transition-none"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-br from-stone-100 via-stone-100 to-stone-200 p-5">
              <span className="font-body text-caption tracking-[0.08em] uppercase text-stone-600">
                Roota ceramics
              </span>
              <span className="font-body text-caption tracking-[0.08em] uppercase text-stone-600">
                Фото скоро
              </span>
            </div>
          )}

          {/* Статус: нет в наличии / мало на складе */}
          {productBadge(product) && (
            <div className="absolute top-4 left-4">
              <span className="font-body text-caption tracking-[0.08em] uppercase inline-block bg-stone-50/90 text-stone-600 px-2.5 py-1.5">
                {bindPrepositions(productBadge(product)!)}
              </span>
            </div>
          )}

          {/* Тёмный hover-оверлей */}
          <div className="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/6 transition-colors duration-500" />

          {/* Подсказка «Смотреть» */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center justify-between bg-stone-50/95 px-5 py-3 backdrop-blur-sm transition-transform duration-250 ease-out lg:translate-y-full lg:group-hover:translate-y-0 lg:group-focus-visible:translate-y-0 motion-reduce:transition-none">
            <span className="font-body text-caption tracking-[0.08em] uppercase text-stone-900">
              Смотреть изделие
            </span>
            <span aria-hidden="true">↗</span>
          </div>
        </div>

        {/* Информация */}
        <div className="space-y-1.5">
          <p className="min-h-[1rem] font-body text-caption tracking-[0.08em] uppercase text-stone-600 transition-colors duration-300 group-hover:text-stone-600">
            {bindPrepositions(product.category?.name ?? "")}
          </p>
          <h3 className="font-display font-light text-price text-stone-800 group-hover:text-stone-900 transition-colors duration-200">
            {bindPrepositions(product.name)}
          </h3>
          <p className="font-body text-copy text-stone-900">
            {bindPrepositions(formatPrice(product.price))}
          </p>
        </div>
      </Link>

      {/* Кнопки действий — вне Link, чтобы не было вложенных <a> */}
      <CardActions
        productId={product.id}
        productSlug={product.slug}
        productName={product.name}
        inStock={product.in_stock}
        stockQty={product.stock_qty ?? null}
        preorderEnabled={product.preorder_enabled}
        leadTimeDays={product.lead_time_days}
      />
    </motion.article>
  );
}
