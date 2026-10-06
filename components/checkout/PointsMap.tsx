"use client";
import { useEffect, useRef, useState } from "react";
import type { DeliveryPoint } from "@/lib/delivery/model";
import type { DeliveryCity } from "@/lib/delivery/geo";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
export default function PointsMap({
  city,
  points,
  onSelect,
}: {
  city: DeliveryCity;
  points: DeliveryPoint[];
  onSelect: (point: DeliveryPoint) => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    callback = useRef(onSelect);
  const [error, setError] = useState("");
  callback.current = onSelect;
  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | undefined;
    const resize = new ResizeObserver(() => map?.invalidateSize());
    async function mount() {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (disposed || !element.current) return;
      map = L.map(element.current).setView([city.latitude, city.longitude], 11);
      resize.observe(element.current);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      })
        .on("tileerror", () => {
          if (!disposed)
            setError("Не удалось загрузить карту. Выберите пункт из списка.");
        })
        .addTo(map);
      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
      });
      const icon = L.divIcon({
        className: "ozon-point-marker",
        html: "<span>O</span>",
        iconSize: [30, 36],
        iconAnchor: [15, 36],
      });
      const positions: import("leaflet").LatLngTuple[] = [];
      for (const point of points) {
        if (!point.coordinates) continue;
        const position: import("leaflet").LatLngTuple = [
          point.coordinates.latitude,
          point.coordinates.longitude,
        ];
        positions.push(position);
        const popup = document.createElement("div"),
          title = document.createElement("strong"),
          address = document.createElement("p"),
          button = document.createElement("button");
        title.textContent = point.name;
        address.textContent = point.address;
        button.textContent = "Выбрать этот пункт";
        button.type = "button";
        button.className = "mt-3 bg-stone-900 text-white px-3 py-2";
        button.addEventListener("click", () => callback.current(point));
        popup.append(title, address, button);
        cluster.addLayer(
          L.marker(position, {
            icon,
            title: point.name,
            alt: point.name,
          }).bindPopup(popup),
        );
      }
      map.addLayer(cluster);
      if (positions.length)
        map.fitBounds(L.latLngBounds(positions), {
          padding: [25, 25],
          maxZoom: 13,
        });
    }
    mount().catch(() => {
      if (!disposed)
        setError("Не удалось открыть карту. Выберите пункт из списка.");
    });
    return () => {
      disposed = true;
      resize.disconnect();
      map?.remove();
    };
  }, [city, points]);
  return (
    <div className="relative min-w-0">
      <div
        ref={element}
        aria-label={`Карта пунктов выдачи: ${city.name}`}
        className="h-[42dvh] min-h-64 md:h-[55dvh] z-0"
      />
      {error && (
        <p
          role="status"
          className="absolute bottom-8 left-3 right-3 z-[500] bg-white p-2 text-xs"
        >
          {error}
        </p>
      )}
    </div>
  );
}
