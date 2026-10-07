"use client";

import { bindPrepositions } from "@/lib/typography";
import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { formatPrice } from "@/lib/products";
import CardActions from "@/components/product/CardActions";
import type { Product } from "@/types";

interface FeaturedProductsProps {
  products: Pick<
    Product,
    | "id"
    | "name"
    | "slug"
    | "price"
    | "primary_image_url"
    | "in_stock"
    | "stock_qty"
    | "preorder_enabled"
    | "lead_time_days"
  >[];
}

export default function FeaturedProducts({ products }: FeaturedProductsProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-60px" });

  return (
    <section ref={sectionRef} className="pb-28 md:pb-36 px-6 md:px-12 lg:px-16">
      <div className="max-w-[1440px] mx-auto">
        {/* Шапка секции */}
        <div className="flex items-end justify-between mb-10 md:mb-14">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="font-display font-normal text-section text-stone-900"
          >
            Избранное
          </motion.h2>

          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            <Link
              href="/catalog"
              className="group hidden md:flex items-center gap-2 font-body text-ui tracking-[0.08em] uppercase text-stone-600 hover:text-stone-900 transition-colors duration-300"
            >
              Весь каталог
              <motion.span
                whileHover={{ x: 3 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <ArrowRight size={13} strokeWidth={1.5} />
              </motion.span>
            </Link>
          </motion.div>
        </div>

        {/* Сетка товаров */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product, i) => (
            <ProductCardFeatured
              key={product.id}
              product={product}
              index={i}
              inView={inView}
            />
          ))}
        </div>

        {/* Кнопка «Весь каталог» на мобильном */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-10 flex md:hidden justify-center"
        >
          <Link
            href="/catalog"
            className="
              font-body text-ui tracking-[0.08em] uppercase
              border border-stone-300 text-stone-700
              px-8 py-3.5
              hover:bg-stone-900 hover:text-stone-50 hover:border-stone-900
              transition-all duration-300
            "
          >
            Весь каталог
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ── Карточка товара ── */
function ProductCardFeatured({
  product,
  index,
  inView,
}: {
  product: Pick<
    Product,
    | "id"
    | "name"
    | "slug"
    | "price"
    | "primary_image_url"
    | "in_stock"
    | "stock_qty"
    | "preorder_enabled"
    | "lead_time_days"
  >;
  index: number;
  inView: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imgSrc = product.primary_image_url ?? null;
  const hasImage = Boolean(imgSrc) && !imageFailed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.65,
        delay: 0.1 + index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {/* Link wraps only image + info — CardActions sits outside to avoid nested <a> */}
      <Link href={`/product/${product.slug}`} className="group block">
        {/* Изображение */}
        <div className="relative aspect-square overflow-hidden rounded-lg bg-stone-100 mb-4">
          {hasImage ? (
            <Image
              src={imgSrc!}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-stone-100 to-stone-200 flex items-end p-4">
              <span className="font-body text-caption text-stone-600 tracking-widest uppercase">
                Фото скоро
              </span>
            </div>
          )}

          {/* Статус: нет в наличии / мало на складе */}
          {!product.in_stock ? (
            <div className="absolute top-4 left-4">
              <span className="font-body text-caption tracking-[0.08em] uppercase inline-block bg-stone-50/90 text-stone-600 px-2.5 py-1.5">
                Скоро в наличии
              </span>
            </div>
          ) : product.stock_qty != null &&
            product.stock_qty > 0 &&
            product.stock_qty <= 3 ? (
            <div className="absolute top-4 left-4">
              <span className="font-body text-caption tracking-[0.08em] uppercase inline-block bg-stone-50/90 text-stone-600 px-2.5 py-1.5">
                {bindPrepositions(
                  product.stock_qty === 1
                    ? "Осталась 1 шт."
                    : `Осталось ${product.stock_qty} шт.`,
                )}
              </span>
            </div>
          ) : null}

          {/* Оверлей при hover */}
          <div
            className="
            absolute inset-0 bg-stone-900/0
            group-hover:bg-stone-900/8
            transition-colors duration-500
          "
          />
        </div>

        {/* Инфо */}
        <div className="space-y-1.5">
          <p className="font-display text-price text-stone-800 group-hover:text-stone-600 transition-colors duration-300">
            {bindPrepositions(product.name)}
          </p>
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
    </motion.div>
  );
}
