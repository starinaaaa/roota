"use client";
import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
type Photo = { src: string; alt: string };
export default function AboutGallery({ photos }: { photos: Photo[] }) {
  const track = useRef<HTMLDivElement>(null);
  const position = useRef(0);
  const arrowTarget = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const count = photos.length;
  useLayoutEffect(() => {
    const element = track.current;
    if (!element || count < 2) return;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let width = 0;
    const stride = () => {
      const first = element.children[0].getBoundingClientRect();
      const second = element.children[1].getBoundingClientRect();
      return second.left - first.left;
    };
    const updatePosition = () => {
      const index =
        ((Math.round(element.scrollLeft / stride()) % count) + count) % count;
      position.current = index;
      setActive(index);
    };
    const settle = () => {
      const period = count * stride();
      const centre = 2 * period;
      const offset =
        (((element.scrollLeft - centre) % period) + period) % period;
      const target = centre + offset;
      arrowTarget.current = null;
      // Rebase only after scrolling and snapping finish. Moving scrollLeft
      // during native smooth scrolling cancels its animation and momentum.
      if (Math.abs(element.scrollLeft - target) > 1) {
        element.scrollTo({ left: target, behavior: "instant" });
      }
      updatePosition();
    };
    const nativeScrollEnd = "onscrollend" in element;
    const onScroll = () => {
      updatePosition();
      if (!nativeScrollEnd) {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(settle, 180);
      }
    };
    const align = () => {
      const nextWidth = element.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      arrowTarget.current = null;
      element.scrollTo({
        left: (count * 2 + position.current) * stride(),
        behavior: "instant",
      });
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(element);
    element.addEventListener("scroll", onScroll, { passive: true });
    if (nativeScrollEnd) element.addEventListener("scrollend", settle);
    return () => {
      observer.disconnect();
      clearTimeout(idleTimer);
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("scrollend", settle);
    };
  }, [count]);
  const step = (direction: number) => {
    const element = track.current;
    if (!element || count < 2) return;
    const stride =
      element.children[1].getBoundingClientRect().left -
      element.children[0].getBoundingClientRect().left;
    const next =
      (arrowTarget.current ?? element.scrollLeft) + direction * stride;
    arrowTarget.current = next;
    element.scrollTo({
      left: next,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  if (!count) return null;
  const copies = count > 1 ? 5 : 1;
  return (
    <section
      aria-label="Фотографии мастерской Roota"
      className="border-t border-stone-200 bg-white py-8 md:py-12"
    >
      <div
        ref={track}
        role="region"
        aria-label="Бесконечная лента фотографий — листайте по горизонтали"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            step(event.key === "ArrowRight" ? 1 : -1);
          }
        }}
        onPointerDown={() => {
          arrowTarget.current = null;
        }}
        onWheel={() => {
          arrowTarget.current = null;
        }}
        className="flex gap-2 overflow-x-auto snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-2 focus-visible:outline-stone-700 focus-visible:outline-offset-4"
      >
        {Array.from({ length: copies }, (_, copy) =>
          photos.map((photo, index) => (
            <div
              key={`${copy}-${photo.src}`}
              aria-hidden={copies > 1 && copy !== 2 ? true : undefined}
              className="relative aspect-square shrink-0 basis-[78%] snap-start sm:basis-[calc((100%_-_8px)/2)] md:basis-[calc((100%_-_16px)/3)] lg:basis-[calc((100%_-_24px)/4)]"
            >
              <Image
                src={photo.src}
                alt={copies > 1 && copy !== 2 ? "" : photo.alt}
                fill
                sizes="(max-width: 640px) 78vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover"
                loading={index < 4 ? "eager" : "lazy"}
              />
            </div>
          )),
        )}
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
