"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Photo = { src: string; alt: string };

export default function AboutGallery({ photos }: { photos: Photo[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const step = (direction: number) => {
    const element = track.current;
    if (!element) return;
    const photo = element.firstElementChild as HTMLElement | null;
    element.scrollBy({
      left: direction * ((photo?.offsetWidth ?? element.clientWidth) + 8),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };

  if (!photos.length) return null;

  return (
    <section
      aria-label="Фотографии мастерской Roota"
      className="border-t border-stone-200 bg-white py-8 md:py-12"
    >
      <div
        ref={track}
        role="region"
        aria-label="Лента фотографий — листайте по горизонтали"
        tabIndex={0}
        onScroll={(event) => {
          const element = event.currentTarget;
          setEdges({
            start: element.scrollLeft <= 1,
            end:
              element.scrollLeft + element.clientWidth >=
              element.scrollWidth - 1,
          });
        }}
        className="flex gap-2 overflow-x-auto snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-2 focus-visible:outline-stone-700 focus-visible:outline-offset-4"
      >
        {photos.map((photo) => (
          <div
            key={photo.src}
            className="relative aspect-square shrink-0 basis-[78%] snap-start sm:basis-[calc((100%_-_8px)/2)] md:basis-[calc((100%_-_16px)/3)] lg:basis-[calc((100%_-_24px)/4)]"
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(max-width: 640px) 78vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <div className="mt-6 flex justify-end gap-2 px-6 md:px-12 lg:px-16">
          <button
            type="button"
            aria-label="Предыдущие фотографии"
            disabled={edges.start}
            onClick={() => step(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 text-stone-900 transition-colors hover:bg-stone-100 focus-visible:outline-2 disabled:opacity-30 disabled:cursor-default"
          >
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Следующие фотографии"
            disabled={edges.end}
            onClick={() => step(1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 text-stone-900 transition-colors hover:bg-stone-100 focus-visible:outline-2 disabled:opacity-30 disabled:cursor-default"
          >
            <ChevronRight size={20} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </section>
  );
}
