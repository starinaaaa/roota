"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { Product } from "@/types";
import {
  favoriteKey,
  encodeSelection,
  type FavoriteItem,
} from "@/lib/favorites";
import { gardenSummary, gardenPrice } from "@/lib/garden";
import { formatPrice } from "@/lib/format-price";
import FavoriteButton, { useFavorites, storeFavorites } from "./FavoriteButton";
export default function FavoritesList({
  products,
  shared,
}: {
  products: Product[];
  shared?: FavoriteItem[];
}) {
  const saved = useFavorites(),
    items = shared ?? saved;
  const [status, setStatus] = useState(""),
    [shareUrl, setShareUrl] = useState(""),
    [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <p className="text-ui">
        {shared
          ? "Подборка, которой с вами поделились."
          : "Избранное хранится в этом браузере. Создайте ссылку, чтобы вернуться с другого устройства или поделиться."}{" "}
        Наличие и цены проверяются при оформлении.
      </p>
      {!items.length && (
        <p>Пока пусто. Сохраните понравившиеся изделия в каталоге.</p>
      )}
      {items.map((item) => {
        const p = products.find((p) => p.id === item.productId);
        return (
          <article
            key={favoriteKey(item)}
            className="border-b border-stone-200 py-5 space-y-2"
          >
            {p ? (
              <>
                <Link
                  className="underline"
                  href={`/product/${p.slug}${item.configuration ? `?garden=${encodeURIComponent(JSON.stringify(item.configuration))}#garden-builder` : ""}`}
                >
                  {p.name}
                </Link>
                <p>
                  {formatPrice(
                    item.configuration
                      ? gardenPrice(item.configuration).total
                      : p.price,
                  )}
                </p>
              </>
            ) : (
              <p>Это изделие больше не опубликовано</p>
            )}
            {item.configuration && (
              <p className="text-ui">
                Состав Сада: {gardenSummary(item.configuration)}
              </p>
            )}
            <FavoriteButton {...item} />
          </article>
        );
      })}
      <div className="flex flex-wrap gap-5">
        {shared && (
          <button
            className="underline"
            onClick={() => {
              try {
                const combined = [...saved, ...items]
                  .filter(
                    (item, i, all) =>
                      all.findIndex(
                        (x) => favoriteKey(x) === favoriteKey(item),
                      ) === i,
                  )
                  .slice(0, 50);
                storeFavorites(combined);
                setStatus("Подборка сохранена в избранное");
              } catch {
                setStatus("Не удалось сохранить");
              }
            }}
          >
            Сохранить подборку себе
          </button>
        )}
        {items.length > 0 && (
          <button
            disabled={pending}
            className="bg-stone-900 text-white px-5 py-3 disabled:opacity-50"
            onClick={() =>
              start(async () => {
                try {
                  const url = `${window.location.origin}/selection?items=${encodeSelection(items)}`;
                  setShareUrl(url);
                  try {
                    await navigator.clipboard.writeText(url);
                    setStatus(
                      "Ссылка скопирована — можно отправить её близкому человеку.",
                    );
                  } catch {
                    setStatus("Ссылка готова. Скопируйте её из поля ниже.");
                  }
                } catch {
                  setStatus("Не удалось создать ссылку. Повторите попытку.");
                }
              })
            }
          >
            {pending ? "Создаём ссылку…" : "Скопировать ссылку на избранное"}
          </button>
        )}
        <Link href="/catalog" className="underline py-3">
          В каталог
        </Link>
      </div>
      {shareUrl && (
        <label className="block space-y-2 text-ui">
          <span>Ссылка на подборку</span>
          <input
            aria-label="Ссылка на подборку"
            readOnly
            value={shareUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full border border-stone-300 p-3"
          />
        </label>
      )}
      {status && (
        <p role="status" className="break-all">
          {status.startsWith("http") ? (
            <a className="underline" href={status}>
              {status}
            </a>
          ) : (
            status
          )}
        </p>
      )}
    </div>
  );
}
