"use client";
import { useSyncExternalStore, useState } from "react";
import {
  favoriteKey,
  favoritesStorageKey,
  selectionSchema,
  type FavoriteItem,
} from "@/lib/favorites";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("roota:favorites", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("roota:favorites", cb);
  };
};
const snapshot = () => {
  try {
    return localStorage.getItem(favoritesStorageKey) ?? "[]";
  } catch {
    return "[]";
  }
};
export function useFavorites() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  try {
    const parsed = selectionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
export function storeFavorites(items: FavoriteItem[]) {
  localStorage.setItem(favoritesStorageKey, JSON.stringify(items));
  window.dispatchEvent(new Event("roota:favorites"));
}
export default function FavoriteButton({
  productId,
  configuration = null,
}: FavoriteItem) {
  const items = useFavorites(),
    item = { productId, configuration },
    key = favoriteKey(item);
  const selected = items.some((i) => favoriteKey(i) === key);
  const [error, setError] = useState("");
  return (
    <div>
      <button
        type="button"
        aria-pressed={selected}
        className="text-ui underline underline-offset-4 py-3"
        onClick={() => {
          try {
            if (!selected && items.length >= 50) {
              setError("В подборке уже 50 изделий");
              return;
            }
            storeFavorites(
              selected
                ? items.filter((i) => favoriteKey(i) !== key)
                : [...items, item],
            );
            setError("");
          } catch {
            setError("Браузер не разрешает сохранить избранное");
          }
        }}
      >
        {selected ? "♥ В избранном" : "♡ Сохранить в избранное"}
      </button>
      {error && (
        <p role="alert" className="text-caption">
          {error}
        </p>
      )}
    </div>
  );
}
