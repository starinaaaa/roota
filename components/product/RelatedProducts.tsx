"use client";
import { productTitle } from "@/lib/product-title";

import { productBadge } from "@/lib/product-badge";
import { bindPrepositions } from "@/lib/typography";
import Link from "next/link";
import Image from "@/components/ui/StoreImage";
import { motion } from "framer-motion";
import { formatPrice } from "@/lib/format-price";
import CardActions from "./CardActions";
import type { Product } from "@/types";

type Props = {
  products: Product[];
};

export default function RelatedProducts({ products }: Props) {
  if (products.length === 0) return null;

  return (
    <section aria-labelledby="related-products-title" className="px-6 md:px-12 lg:px-16 pb-20 md:pb-28">
      <div className="max-w-[1440px] mx-auto">
        <div className="divider mb-14" />

        <div className="flex items-baseline justify-between mb-10 md:mb-14">
          <h2 id="related-products-title" className="scroll-mt-24 font-display text-section text-stone-900">
            Другие работы
          </h2>
          <Link
            href="/catalog"
            className="hidden md:block font-body text-ui tracking-[0.08em] uppercase text-stone-600 hover:text-stone-900 transition-colors duration-200"
          >
            Весь каталог
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-8 md:gap-6">
          {products.map((p, i) => (
            <motion.div
              key={p.id}
              className="h-full min-w-0 flex flex-col"
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{
                duration: 0.25,
                delay: i * 0.07,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {/* Link wraps only image + info — CardActions sits outside to avoid nested <a> */}
              <Link
                href={`/product/${p.slug}`}
                className="group flex min-w-0 flex-col flex-1"
              >
                <div className="relative aspect-square overflow-hidden store-media bg-stone-100 mb-4">
                  {p.images[0] && (
                    <Image
                      src={p.images[0]}
                      alt={p.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    />
                  )}

                  {/* Статус: нет в наличии / мало на складе */}
                  {productBadge(p) && (
                    <div className="absolute top-4 left-4">
                      <span className="font-body text-caption tracking-[0.08em] uppercase inline-block bg-stone-50/90 text-stone-600 px-2.5 py-1.5">
                        {bindPrepositions(productBadge(p)!)}
                      </span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/6 transition-colors duration-500" />
                </div>
                <p className="font-display text-copy sm:text-price [overflow-wrap:anywhere] text-stone-800 mb-0.5">
                  {bindPrepositions(productTitle(p.name, p.category))}
                </p>
                <p className="font-body text-copy text-stone-900">
                  {p.configurator === "garden" ? "Поштучно от 250 ₽ · Свой набор" : bindPrepositions(formatPrice(p.price))}
                </p>
              </Link>

              {/* Кнопки действий — вне Link, чтобы не было вложенных <a> */}
              <CardActions
                configurator={p.configurator}
                productId={p.id}
                productSlug={p.slug}
                productName={p.name}
                inStock={p.in_stock}
                stockQty={p.stock_qty ?? null}
                preorderEnabled={p.preorder_enabled}
                leadTimeDays={p.lead_time_days}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
