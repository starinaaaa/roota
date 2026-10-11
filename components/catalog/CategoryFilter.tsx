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
            key={slug}
            aria-pressed={isActive}
            onClick={() => handleSelect(slug)}
            className={`
              relative shrink-0 py-2 pr-7
              font-body text-ui tracking-[0.08em] uppercase
              transition-colors duration-200 whitespace-nowrap
              ${isActive ? "text-stone-900" : "text-stone-800 hover:text-stone-700"}
            `}
          >
            {bindPrepositions(label)}
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
      <label className="flex items-center gap-2 py-2 font-body text-ui text-stone-800 cursor-pointer">
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
          className="accent-stone-900"
        />
        В наличии
      </label>
    </nav>
  );
}
