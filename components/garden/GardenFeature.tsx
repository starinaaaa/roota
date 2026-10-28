import Link from "next/link";
import Image from "@/components/ui/StoreImage";
import type { Product } from "@/types";

export default function GardenFeature({ product }: { product: Product }) {
  return (
    <section
      className="px-6 pt-12 md:px-12 md:pt-20 lg:px-16"
      aria-labelledby="garden-feature-title"
    >
      <div className="mx-auto grid max-w-[1440px] items-center gap-8 border-b border-stone-200 pb-8 md:grid-cols-2 md:gap-14 md:pb-10">
        <Link
          href={`/product/${product.slug}`}
          className="relative block aspect-square overflow-hidden rounded-lg bg-[#f1f3eb]"
        >
          <Image
            src={product.images[0]}
            alt="Сад: керамические цветочки, стебли и листочки"
            fill
            sizes="(max-width: 767px) calc(100vw - 48px), 50vw"
            className="object-cover"
          />
        </Link>
        <div className="max-w-lg space-y-6">
          <p className="font-body text-caption uppercase tracking-[0.08em] text-stone-600">
            Новый объект · Для игры и созерцания
          </p>
          <h2
            id="garden-feature-title"
            className="font-display text-section leading-tight text-stone-900"
          >
            Сад, который
            <br />
            можно построить
          </h2>
          <p className="font-body text-copy leading-relaxed text-stone-700">
            Керамический конструктор для выращивания сада дома и тренировки
            равновесия. Соберите свое растение из кусочков стеблей, цветов и
            листочков.
          </p>
          <p className="text-sm text-stone-600">
            Четыре размера сада · Свой состав · Изготовление — примерно 3 недели
          </p>
          <Link
            href={`/product/${product.slug}#garden-builder`}
            className="inline-flex min-h-12 items-center gap-5 border-b border-stone-900 font-body text-ui uppercase tracking-[0.08em]"
          >
            Собрать свой сад <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
