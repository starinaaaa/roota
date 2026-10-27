"use client";

import { bindPrepositions } from "@/lib/typography";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

type FilterCategory = {
  slug: string;
  label: string;
};

type Props = {
  activeSlug: string;
  categories: FilterCategory[];
};

export default function CategoryFilter({ activeSlug, categories }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = (slug: string) => {
    const params = new URLSearchParams(
      searchParams.get("sort") ? { sort: searchParams.get("sort")! } : {},
    );
    if (slug === "all") {
      params.delete("category");
    } else {
      params.set("category", slug);
    }
    const qs = params.toString();
    router.push(`/catalog${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  return (
    <nav
      aria-label="Фильтр по категориям"
      className="flex flex-wrap items-center gap-x-1 gap-y-2 pb-1"
    >
      {categories.map(({ slug, label }) => {
        const isActive = slug === activeSlug;

        return (
          <button
            data-custom-underline
            key={slug}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleSelect(slug)}
            className={`
              group relative shrink-0 py-2 pr-7
              font-body text-ui tracking-[0.08em] uppercase
              transition-colors duration-200 whitespace-nowrap
              ${isActive ? "text-stone-900" : "text-stone-800 hover:text-stone-900"}
            `}
          >
            {bindPrepositions(label)}
            {!isActive && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 right-7 h-px origin-left scale-x-0 bg-stone-500 transition-transform duration-200 group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none"
              />
            )}
            {isActive && (
              <motion.span
                layoutId="filter-underline"
                className="absolute bottom-0 left-0 right-7 h-px bg-stone-900"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </button>
        );
      })}
      <label className="flex items-center gap-2 py-2 font-body text-ui text-stone-800 sm:ml-auto">
        <span className="sr-only">Сортировка</span>
        <select
          aria-label="Сортировка"
          value={
            searchParams.get("sort") === "price_asc" ||
            searchParams.get("sort") === "price_desc"
              ? searchParams.get("sort")!
              : "newest"
          }
          onChange={(event) => {
            const params = new URLSearchParams();
            if (activeSlug !== "all") params.set("category", activeSlug);
            params.set("sort", event.target.value);
            router.push(`/catalog?${params}`, { scroll: false });
          }}
          className="max-w-full cursor-pointer bg-transparent py-1 pr-2 focus-visible:outline-stone-500"
        >
          <option value="newest">Сначала новые</option>
          <option value="price_asc">Сначала дешевле</option>
          <option value="price_desc">Сначала дороже</option>
        </select>
      </label>
    </nav>
  );
}
