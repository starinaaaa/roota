'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

type Props = {
  images: string[]
  name: string
}

export default function ProductImages({ images, name }: Props) {
  const [active, setActive] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // prev/next use functional updates — no stale-closure risk, safe to omit from deps
  const prev = () => setActive((i) => (i - 1 + images.length) % images.length)
  const next = () => setActive((i) => (i + 1) % images.length)

  // Keyboard: Esc closes, arrow keys navigate (only when lightbox is open)
  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     setLightboxOpen(false)
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll lock while lightbox is open
  useEffect(() => {
    document.body.style.overflow = lightboxOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [lightboxOpen])

  if (images.length === 0) {
    return (
      <div className="aspect-square rounded-lg bg-stone-100 flex items-center justify-center">
        <span className="font-body text-xs tracking-widest uppercase text-stone-400">
          Фото скоро
        </span>
      </div>
    )
  }

  const multi = images.length > 1

  return (
    <>
      <div className="flex flex-col gap-3">

        {/* ── Main image ── */}
        <div className="relative aspect-square overflow-hidden rounded-lg bg-stone-100 select-none">

          <Image
            key={active}
            src={images[active]}
            alt={`${name} — фото ${active + 1}`}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain"
            priority
          />

          {/* ── Left zone (1/5) — prev + hover tint ── */}
          {multi && (
            <button
              onClick={prev}
              aria-label="Предыдущее фото"
              className="group absolute inset-y-0 left-0 w-1/5 z-10 flex items-center justify-center cursor-pointer"
            >
              {/* Tint overlay */}
              <span className="absolute inset-0 rounded-l-lg bg-stone-900/0 group-hover:bg-stone-900/15 transition-colors duration-200" />
              {/* Arrow */}
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-md transition-all duration-200 group-hover:shadow-lg group-hover:scale-105">
                <ChevronLeft size={18} strokeWidth={1.5} className="text-stone-700" />
              </span>
            </button>
          )}

          {/* ── Center zone (3/5) — opens lightbox ── */}
          <button
            onClick={() => setLightboxOpen(true)}
            aria-label="Открыть фото на весь экран"
            className={[
              'absolute inset-y-0 z-10 cursor-zoom-in',
              multi ? 'left-[20%] right-[20%]' : 'inset-x-0',
            ].join(' ')}
          />

          {/* ── Right zone (1/5) — next + hover tint ── */}
          {multi && (
            <button
              onClick={next}
              aria-label="Следующее фото"
              className="group absolute inset-y-0 right-0 w-1/5 z-10 flex items-center justify-center cursor-pointer"
            >
              <span className="absolute inset-0 rounded-r-lg bg-stone-900/0 group-hover:bg-stone-900/15 transition-colors duration-200" />
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-md transition-all duration-200 group-hover:shadow-lg group-hover:scale-105">
                <ChevronRight size={18} strokeWidth={1.5} className="text-stone-700" />
              </span>
            </button>
          )}
        </div>

        {/* ── Thumbnails ── */}
        {multi && (
          <div className="flex flex-row gap-2">
            {images.map((src, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                aria-label={`Фото ${i + 1}`}
                className={[
                  'relative w-24 h-24 shrink-0 overflow-hidden rounded-md bg-stone-100',
                  'cursor-pointer transition-all duration-200',
                  i === active
                    ? 'ring-2 ring-stone-800 opacity-100'
                    : 'opacity-50 hover:opacity-80 ring-1 ring-stone-200',
                ].join(' ')}
              >
                <Image
                  src={src}
                  alt={`${name} — миниатюра ${i + 1}`}
                  fill
                  className="object-contain"
                  sizes="96px"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

      </div>

      {/* ── Lightbox ────────────────────────────────────────────────────────────
          fixed inset-0 works even inside overflow:hidden parents.
          Active state is shared with the gallery — thumbnails and lightbox
          stay in sync, and closing the lightbox leaves the gallery on the
          last image viewed.
      ─────────────────────────────────────────────────────────────────────── */}
      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${name} — просмотр фото`}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/95"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Image container — stopPropagation so clicking the image itself
              doesn't bubble up and close the lightbox */}
          <div
            className="relative"
            style={{ width: '90vw', height: '90vh', maxWidth: '1400px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              key={`lb-${active}`}
              src={images[active]}
              alt={`${name} — фото ${active + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>

          {/* Close */}
          <button
            onClick={() => setLightboxOpen(false)}
            aria-label="Закрыть"
            className="absolute top-5 right-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-200"
          >
            <X size={20} strokeWidth={1.5} className="text-white" />
          </button>

          {/* Lightbox nav arrows */}
          {multi && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prev() }}
                aria-label="Предыдущее фото"
                className="absolute left-5 top-1/2 -translate-y-1/2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-200"
              >
                <ChevronLeft size={22} strokeWidth={1.5} className="text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); next() }}
                aria-label="Следующее фото"
                className="absolute right-5 top-1/2 -translate-y-1/2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-200"
              >
                <ChevronRight size={22} strokeWidth={1.5} className="text-white" />
              </button>
            </>
          )}

          {/* Counter */}
          {multi && (
            <p className="absolute bottom-5 left-1/2 -translate-x-1/2 font-body text-xs tracking-[0.2em] text-white/40">
              {active + 1} / {images.length}
            </p>
          )}
        </div>
      )}
    </>
  )
}
