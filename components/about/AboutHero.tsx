"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

type Photo = { src: string; alt: string };

export default function AboutHero({
  photos,
  title,
}: {
  photos: Photo[];
  title: string;
}) {
  const [active, setActive] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [touching, setTouching] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAutoPlay(!preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!autoPlay || touching || photos.length < 2) return;
    const timer = window.setTimeout(() => {
      setActive((current) => (current + 1) % photos.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [active, autoPlay, touching, photos.length]);

  const step = (direction: number) => {
    setActive(
      (current) => (current + direction + photos.length) % photos.length,
    );
  };

  return (
    <section
      aria-label="О студии Roota"
      aria-roledescription="галерея"
      style={{ touchAction: "pan-y pinch-zoom" }}
      onTouchStart={(event) => {
        if (event.touches.length !== 1) {
          touchStart.current = null;
          setTouching(false);
          return;
        }
        const touch = event.touches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
        setTouching(true);
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        setTouching(false);
        if (!start || photos.length < 2) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          step(dx < 0 ? 1 : -1);
        }
      }}
      onTouchCancel={() => {
        touchStart.current = null;
        setTouching(false);
      }}
      className="relative isolate flex min-h-[520px] items-center overflow-hidden bg-stone-800 px-6 py-24 md:min-h-[640px] md:px-12 lg:px-16"
    >
      {photos.map((photo, index) => (
        <div
          key={photo.src}
          aria-hidden={index !== active}
          className={`absolute inset-0 -z-20 transition-opacity duration-1000 motion-reduce:transition-none ${index === active ? "opacity-100" : "opacity-0"}`}
        >
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            priority={index === 0}
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ))}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-stone-950/60 via-stone-950/35 to-stone-950/15" />
      <div className="mx-auto w-full max-w-[1440px]">
        <p className="mb-8 font-body text-sm uppercase tracking-[0.2em] text-white md:text-base">
          О студии
        </p>
        <h1 className="max-w-[900px] font-display text-[clamp(2.7rem,5.5vw,5.5rem)] leading-[1.08] text-white whitespace-pre-line break-words">
          {title}
        </h1>
      </div>
      {photos.length > 1 && (
        <div className="absolute inset-x-6 bottom-8 flex items-center justify-between md:inset-x-12 lg:inset-x-16">
          <p
            className="font-body text-xs tracking-[0.2em] text-white"
            aria-live="off"
          >
            {String(active + 1).padStart(2, "0")} /{" "}
            {String(photos.length).padStart(2, "0")}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={
                autoPlay ? "Приостановить слайд-шоу" : "Запустить слайд-шоу"
              }
              onClick={() => setAutoPlay((current) => !current)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/50 text-white transition-colors hover:bg-white/20 focus-visible:bg-white/20"
            >
              {autoPlay ? (
                <Pause size={16} strokeWidth={1.5} />
              ) : (
                <Play size={16} strokeWidth={1.5} />
              )}
            </button>
            <button
              type="button"
              aria-label="Предыдущее фото"
              onClick={() => step(-1)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/50 text-white transition-colors hover:bg-white/20 focus-visible:bg-white/20"
            >
              <ChevronLeft size={20} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Следующее фото"
              onClick={() => step(1)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/50 text-white transition-colors hover:bg-white/20 focus-visible:bg-white/20"
            >
              <ChevronRight size={20} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
