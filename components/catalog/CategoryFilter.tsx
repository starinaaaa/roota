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
    const params = new URLSearchParams(searchParams.toString());
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
      className="flex flex-wrap gap-x-1 gap-y-2 pb-1"
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
      <label className="group flex items-center gap-2 py-2 font-body text-ui text-stone-800 cursor-pointer transition-colors duration-200 hover:text-stone-900 motion-reduce:transition-none">
        <input
          type="checkbox"
          checked={searchParams.get("stock") === "1"}
          onChange={(event) => {
            const params = new URLSearchParams(searchParams.toString());
            if (event.target.checked) params.set("stock", "1");
            else params.delete("stock");
            router.push(`/catalog${params.size ? `?${params}` : ""}`, {
              scroll: false,
            });
          }}
          className="accent-stone-900 cursor-pointer transition-shadow duration-200 group-hover:ring-2 group-hover:ring-stone-300 ring-offset-2 ring-offset-stone-50 motion-reduce:transition-none"
        />
        <span className="underline-offset-4 group-hover:underline group-focus-within:underline">
          В наличии
        </span>
      </label>
    </nav>
  );
}
