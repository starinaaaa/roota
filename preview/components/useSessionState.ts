"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Dispatch, SetStateAction } from "react";
const eventName = "roota-preview-storage";
function subscribe(listener: () => void) {
  window.addEventListener(eventName, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener("storage", listener);
  };
}
const serverSnapshot = () => null;
export function useSessionState<T>(
  key: string,
  initial: T,
  validate: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const snapshot = useCallback(() => {
    try {
      return sessionStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const parse = useCallback(
    (text: string | null): T => {
      try {
        const value: unknown = JSON.parse(text || "null");
        return validate(value) ? value : initial;
      } catch {
        return initial;
      }
    },
    [initial, validate],
  );
  const state = useMemo(() => parse(raw), [parse, raw]);
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (value) => {
      const previous = parse(snapshot());
      const next =
        typeof value === "function"
          ? (value as (previous: T) => T)(previous)
          : value;
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
        window.dispatchEvent(new Event(eventName));
      } catch {
        window.alert(
          "Браузер запретил сохранение. Разрешите хранилище сайта, чтобы проверить корзину.",
        );
      }
    },
    [key, parse, snapshot],
  );
  return [state, set, raw !== null];
}
