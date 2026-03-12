'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  images: string[]
  name: string
}

export default function ProductImages({ images, name }: Props) {
  const [active, setActive] = useState(0)

  return (
    <div className="flex flex-col gap-4">
      {/* Главное фото */}
      <div className="relative aspect-[4/5] overflow-hidden bg-stone-100">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          >
            <Image
              src={images[active]}
              alt={`${name} — фото ${active + 1}`}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Миниатюры */}
      {images.length > 1 && (
        <div className="flex gap-2.5">
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`
                relative overflow-hidden aspect-square w-20 shrink-0 bg-stone-100
                transition-opacity duration-300
                ${i === active ? 'opacity-100 ring-1 ring-stone-300' : 'opacity-40 hover:opacity-65'}
              `}
            >
              <Image
                src={src}
                alt={`${name} — миниатюра ${i + 1}`}
                fill
                className="object-cover"
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
