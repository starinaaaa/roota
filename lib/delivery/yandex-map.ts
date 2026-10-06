"use client";
import type * as ymaps from "yandex-maps";
declare global {
  interface Window {
    ymaps?: typeof ymaps;
  }
}
let loading: Promise<typeof ymaps> | undefined;
export function loadYandexMaps(key: string): Promise<typeof ymaps> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => fail(), 20000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(
        new Error(
          "Не удалось загрузить Яндекс.Карты. Выберите пункт из списка.",
        ),
      );
    }
    function ready() {
      const api = window.ymaps;
      if (!api) {
        fail();
        return;
      }
      api.ready(() => {
        clearTimeout(timer);
        resolve(api);
      }, fail);
    }
    if (window.ymaps) {
      ready();
      return;
    }
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
    script.async = true;
    script.onload = ready;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}
