'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'

type FilterCategory = {
  slug: string
  label: string
}

type Props = {
  activeSlug: string
  categories: FilterCategory[]
}

export default function CategoryFilter({ activeSlug, categories }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSelect = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (slug === 'all') {
      params.delete('category')
    } else {
      params.set('category', slug)
    }
    const qs = params.toString()
    router.push(`/catalog${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  return (
    <nav
      aria-label="Фильтр по категориям"
      className="flex gap-0 overflow-x-auto pb-1 -mx-6 px-6 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {categories.map(({ slug, label }) => {
        const isActive = slug === activeSlug

        return (
          <button
            key={slug}
            onClick={() => handleSelect(slug)}
            className={`
              relative shrink-0 py-2 pr-7
              font-body text-[14px] tracking-[0.18em] uppercase
              transition-colors duration-200 whitespace-nowrap
              ${isActive ? 'text-stone-900' : 'text-stone-800 hover:text-stone-700'}
            `}
          >
            {label}
            {isActive && (
              <motion.span
                layoutId="filter-underline"
                className="absolute bottom-0 left-0 right-7 h-px bg-stone-900"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
