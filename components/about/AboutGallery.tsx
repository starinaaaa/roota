"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Photo = { src: string; alt: string };

export default function AboutGallery({ photos }: { photos: Photo[] }) {
  const [viewport, carousel] = useEmblaCarousel(
    { loop: true, align: "start", duration: 35 },
    [WheelGesturesPlugin()],
  );
  const [active, setActive] = useState(0);
  const count = photos.length;

  useEffect(() => {
    if (!carousel) return;
    const select = () => setActive(carousel.selectedScrollSnap());
    carousel.on("select", select).on("reInit", select);
    return () => {
      carousel.off("select", select).off("reInit", select);
    };
  }, [carousel]);

  function step(direction: number) {
    const jump = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (direction > 0) carousel?.scrollNext(jump);
    else carousel?.scrollPrev(jump);
  }

  if (!count) return null;
  return (
    <section
      aria-label="Фотографии мастерской Roota"
      className="border-t border-stone-200 bg-white py-8 md:py-12"
    >
      <div
        ref={viewport}
        role="region"
        aria-roledescription="карусель"
        aria-label="Бесконечная лента фотографий — листайте по горизонтали"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            step(event.key === "ArrowRight" ? 1 : -1);
          }
        }}
        className="overflow-hidden focus-visible:outline-2 focus-visible:outline-stone-700 focus-visible:outline-offset-4"
      >
        <div className="flex gap-2 [touch-action:pan-y_pinch-zoom] select-none cursor-grab active:cursor-grabbing">
          {photos.map((photo, index) => (
            <div
              key={photo.src}
              role="group"
              aria-label={`Фото ${index + 1} из ${count}`}
              className="relative min-w-0 aspect-square shrink-0 basis-[78%] sm:basis-[calc((100%_-_8px)/2)] md:basis-[calc((100%_-_16px)/3)] lg:basis-[calc((100%_-_24px)/4)]"
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                draggable={false}
                sizes="(max-width: 640px) 78vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover"
                loading={index < 4 ? "eager" : "lazy"}
              />
            </div>
          ))}
        </div>
      </div>
      {count > 1 && (
        <div className="mt-6 flex items-center justify-end gap-2 px-6 md:px-12 lg:px-16">
          <span
            className="mr-auto font-body text-caption text-stone-500"
            aria-live="polite"
          >
            {active + 1} / {count}
          </span>
          <button
            type="button"
            aria-label="Предыдущие фотографии"
            onClick={() => step(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 text-stone-900 hover:bg-stone-100 focus-visible:outline-2"
          >
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Следующие фотографии"
            onClick={() => step(1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 text-stone-900 hover:bg-stone-100 focus-visible:outline-2"
          >
            <ChevronRight size={20} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </section>
  );
}
