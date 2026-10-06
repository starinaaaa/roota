"use client";
import type * as ymaps from "yandex-maps";
import { useEffect, useRef, useState } from "react";
import type { DeliveryPoint } from "@/lib/delivery/model";
import type { DeliveryCity } from "@/lib/delivery/geo";
import { loadYandexMaps } from "@/lib/delivery/yandex-map";
export default function PointsMap({
  city,
  points,
  onSelect,
}: {
  city: DeliveryCity;
  points: DeliveryPoint[];
  onSelect: (point: DeliveryPoint) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(""),
    [selected, setSelected] = useState<DeliveryPoint | null>(null);
  const key = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
  useEffect(() => {
    if (!key) return;
    let disposed = false,
      map: ymaps.Map | undefined;
    const observer = new ResizeObserver(() => map?.container.fitToViewport());
    async function mount() {
      const api = await loadYandexMaps(key!);
      if (disposed || !element.current) return;
      map = new api.Map(element.current, {
        center: [city.latitude, city.longitude],
        zoom: 11,
        controls: ["zoomControl", "fullscreenControl"],
      });
      observer.observe(element.current);
      const clusterOptions = {
        preset: "islands#invertedBlueClusterIcons" as const,
        groupByCoordinates: false,
        clusterDisableClickZoom: false,
        clusterOpenBalloonOnClick: false,
      };
      const cluster = new api.Clusterer(clusterOptions);
      const markers = points
        .filter((p) => p.coordinates)
        .map((p) => {
          const marker = new api.Placemark(
            [p.coordinates!.latitude, p.coordinates!.longitude],
            {},
            { preset: "islands#blueDotIcon", openBalloonOnClick: false },
          );
          marker.events.add("click", () => {
            if (!disposed) setSelected(p);
          });
          return marker;
        });
      cluster.add(markers);
      // Yandex supports Clusterer here; community typings omit that overload.
      map.geoObjects.add(cluster as unknown as ymaps.IGeoObject);
      // Keep the selected city's centre even when only the first page of points is loaded.
    }
    mount().catch((e) => {
      if (!disposed)
        setError(
          e instanceof Error
            ? e.message
            : "Не удалось открыть Яндекс.Карты. Выберите пункт из списка.",
        );
    });
    return () => {
      disposed = true;
      observer.disconnect();
      map?.destroy();
    };
  }, [city, points, key]);
  const current =
    selected && points.some((p) => p.id === selected.id) ? selected : null;
  return (
    <div className="relative min-w-0">
      <div
        ref={element}
        aria-label={`Яндекс.Карта пунктов выдачи: ${city.name}`}
        className="h-[42dvh] min-h-64 md:h-[55dvh] z-0 bg-stone-100"
      />
      {(!key || error) && (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center p-6 text-sm text-stone-500 text-center"
        >
          {key
            ? error
            : "Яндекс.Карта временно недоступна. Выберите пункт из списка."}
        </div>
      )}
      {current && (
        <div className="absolute bottom-4 left-4 right-4 z-10 bg-white border border-stone-200 shadow-lg p-4 space-y-2">
          <div className="flex justify-between gap-3">
            <p className="text-sm font-medium">{current.name}</p>
            <button
              type="button"
              aria-label="Закрыть карточку пункта"
              onClick={() => setSelected(null)}
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-stone-500">{current.address}</p>
          <button
            type="button"
            onClick={() => onSelect(current)}
            className="bg-stone-900 text-white text-xs px-4 py-2"
          >
            Выбрать этот пункт
          </button>
        </div>
      )}
    </div>
  );
}
