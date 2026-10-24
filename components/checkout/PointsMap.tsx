"use client";
import { bindPrepositions } from "@/lib/typography";
import type * as ymaps from "yandex-maps";
import { useEffect, useRef, useState } from "react";
import type { DeliveryPoint } from "@/lib/delivery/model";
import type { DeliveryCity } from "@/lib/delivery/geo";
import { loadYandexMaps } from "@/lib/delivery/yandex-map";
type Viewport = { lat: number; lon: number; bounds: number[] };
export default function PointsMap({
  city,
  points,
  onSelect,
  onViewport,
}: {
  city: DeliveryCity;
  points: DeliveryPoint[];
  onSelect: (point: DeliveryPoint) => void;
  onViewport: (value: Viewport) => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    cluster = useRef<ymaps.Clusterer | null>(null);
  const latest = useRef({ points, onViewport });
  useEffect(() => {
    latest.current = { points, onViewport };
  }, [points, onViewport]);
  const [error, setError] = useState(""),
    [selected, setSelected] = useState<DeliveryPoint | null>(null);
  const key = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
  const updateMarkers = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!key) return;
    let disposed = false,
      map: ymaps.Map | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => map?.container.fitToViewport());
    const report = () => {
      if (!map || disposed) return;
      const bounds = map.getBounds(),
        centre = map.getCenter();
      if (!bounds) return;
      const round = (n: number) => Math.round(n * 1000) / 1000;
      latest.current.onViewport({
        lat: round(centre[0]),
        lon: round(centre[1]),
        bounds: [
          Math.floor(bounds[0][0] * 1000) / 1000,
          Math.floor(bounds[0][1] * 1000) / 1000,
          Math.ceil(bounds[1][0] * 1000) / 1000,
          Math.ceil(bounds[1][1] * 1000) / 1000,
        ],
      });
    };
    async function mount() {
      const api = await loadYandexMaps(key!);
      if (disposed || !element.current) return;
      map = new api.Map(element.current, {
        center: [city.latitude, city.longitude],
        zoom: 12,
        controls: ["zoomControl", "fullscreenControl"],
      });
      observer.observe(element.current);
      const options = {
        preset: "islands#invertedBlueClusterIcons",
        groupByCoordinates: false,
        clusterDisableClickZoom: false,
        clusterOpenBalloonOnClick: false,
      };
      cluster.current = new api.Clusterer(options);
      map.geoObjects.add(cluster.current as unknown as ymaps.IGeoObject);
      updateMarkers.current = () => {
        if (disposed || !cluster.current) return;
        cluster.current.removeAll();
        cluster.current.add(
          latest.current.points
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
            }),
        );
      };
      updateMarkers.current();
      map.events.add("boundschange", () => {
        clearTimeout(timer);
        timer = setTimeout(report, 180);
      });
      report();
    }
    mount().catch(() => {
      if (!disposed)
        setError("Не удалось открыть карту. Выберите пункт из списка.");
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      observer.disconnect();
      map?.destroy();
      cluster.current = null;
      updateMarkers.current = null;
    };
  }, [city.latitude, city.longitude, key]);
  useEffect(() => {
    updateMarkers.current?.();
  }, [points]);
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
          className="absolute inset-0 flex items-center justify-center p-6 text-ui text-stone-600 text-center"
        >
          {bindPrepositions(
            key
              ? error
              : "Яндекс.Карта временно недоступна. Выберите пункт из списка.",
          )}
        </div>
      )}
      {current && (
        <div className="absolute bottom-4 left-4 right-4 z-10 bg-white border border-stone-200 shadow-lg p-4 space-y-2">
          <div className="flex justify-between gap-3">
            <p className="text-ui font-medium">
              {bindPrepositions(current.name)}
            </p>
            <button
              type="button"
              aria-label="Закрыть карточку пункта"
              onClick={() => setSelected(null)}
            >
              ✕
            </button>
          </div>
          <p className="text-caption text-stone-600">
            {bindPrepositions(current.address)}
          </p>
          <button
            type="button"
            onClick={() => onSelect(current)}
            className="bg-stone-900 text-white text-caption px-4 py-2"
          >
            Выбрать этот пункт
          </button>
        </div>
      )}
    </div>
  );
}
