"use client";

import { shopFeatures } from "@/lib/shop-features";
import { productionEstimate } from "@/lib/preorder-copy";
import FavoriteButton from "@/components/favorites/FavoriteButton";
import { useState } from "react";
import { useCart } from "@/hooks/useCart";
import type { Product } from "@/types";
import {
  defaultGarden,
  gardenCare,
  type GardenConfiguration,
} from "@/lib/garden";
import GardenBuilder from "./GardenBuilder";
import GardenRequest from "./GardenRequest";

export default function GardenProduct({
  product,
  telegram,
  initial = defaultGarden(),
}: {
  product: Product;
  telegram: string;
  initial?: GardenConfiguration;
}) {
  const { saveGardenItem, openDrawer } = useCart();
  const [lastGarden, setLastGarden] = useState(initial);
  return (
    <div className="min-w-0 space-y-8">
      <div className="space-y-3">
        <p className="font-body text-caption uppercase tracking-[0.08em] text-stone-600">
          Объекты · Керамический конструктор
        </p>
        <h1 className="font-display text-section leading-tight text-stone-900">
          Сад
        </h1>
        <p className="inline-block rounded-md border border-[#687851]/30 bg-[#f1f3eb] px-4 py-3 text-ui font-medium text-[#526444]">
          Предзаказ · {productionEstimate(21)} после оплаты
        </p>
        <p className="max-w-xl text-copy leading-relaxed text-stone-700">
          Постройте свой домашний сад. Найдите равновесие, соберите башенки и
          попробуйте ещё раз.
        </p>
      </div>
      <div id="garden-builder" className="scroll-mt-28">
        <GardenBuilder
          initial={initial}
          onChange={setLastGarden}
          onSave={async (c) => {
            const saved = await saveGardenItem(product.id, c);
            if (saved) {
              setLastGarden(c);
              openDrawer();
            }
            return saved;
          }}
        />
      </div>
      {shopFeatures.wishlist && (
        <FavoriteButton productId={product.id} configuration={lastGarden} />
      )}
      <GardenRequest telegram={telegram} configuration={lastGarden} />
      <div className="divide-y divide-stone-200 border-y border-stone-200">
        <details open className="py-5">
          <summary className="cursor-pointer font-body text-ui uppercase tracking-[0.08em]">
            Об этом саде
          </summary>
          <p className="mt-4 whitespace-pre-wrap text-copy leading-relaxed text-stone-700">
            {product.description}
          </p>
          <p className="mt-4 text-sm text-stone-600">
            Глина, ангобы · Каждая деталь создана вручную
          </p>
        </details>
        <details className="py-5">
          <summary className="cursor-pointer font-body text-ui uppercase tracking-[0.08em]">
            Как играть и ухаживать
          </summary>
          <p className="mt-4 text-copy leading-relaxed text-stone-700">
            {product.care || gardenCare}
          </p>
        </details>
      </div>
    </div>
  );
}
