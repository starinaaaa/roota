"use client";

import { useId, useState, useTransition } from "react";
import { Check, Minus, Plus, Sprout } from "lucide-react";
import {
  defaultGarden,
  gardenCount,
  gardenCountLabel,
  gardenName,
  gardenParts,
  gardenPrice,
  gardenSizes,
  type GardenConfiguration,
  type GardenPart,
} from "@/lib/garden";
import { formatPrice } from "@/lib/format-price";

type Props = {
  initial?: GardenConfiguration;
  onSave: (configuration: GardenConfiguration) => Promise<boolean>;
  saveLabel?: string;
  onCancel?: () => void;
  onChange?: (configuration: GardenConfiguration) => void;
};

export default function GardenBuilder({
  initial,
  onSave,
  saveLabel = "Добавить сад в корзину",
  onCancel,
  onChange,
}: Props) {
  const id = useId();
  const [configuration, setConfiguration] = useState<GardenConfiguration>(
    () => initial ?? defaultGarden(),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const count = gardenCount(configuration);
  const remaining =
    configuration.size === 0 ? 100 - count : configuration.size - count;
  const valid =
    configuration.size === 0 ? count > 0 && count <= 100 : remaining === 0;
  const price = gardenPrice(configuration);

  function changePart(key: GardenPart, value: number) {
    if (!Number.isFinite(value)) return;
    const limit = configuration[key] + remaining;
    const next = {
      ...configuration,
      [key]: Math.max(0, Math.min(limit, Math.trunc(value))),
    };
    setConfiguration(next);
    onChange?.(next);
    setError("");
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || pending) return;
        setError("");
        startTransition(async () => {
          try {
            if (!(await onSave(configuration)))
              setError(
                "Сад не сохранён. Проверьте соединение и попробуйте ещё раз.",
              );
          } catch {
            setError("Не удалось сохранить сад. Попробуйте ещё раз.");
          }
        });
      }}
      className="garden-builder min-w-0 space-y-7"
      aria-label="Собрать свой сад"
    >
      <fieldset disabled={pending} className="min-w-0">
        <legend className="mb-2 font-body text-ui uppercase tracking-[0.08em] text-stone-800">
          1. Выберите размер сада
        </legend>
        <p className="mb-4 text-sm leading-relaxed text-stone-600">
          Размер — количество всех деталей, включая листочки.
        </p>
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
          {gardenSizes.map((size) => {
            const selected = configuration.size === size.size;
            return (
              <label
                key={size.size}
                className={`relative flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-[#687851] focus-within:ring-offset-2 ${selected ? "border-[#687851] bg-[#f1f3eb]" : "border-stone-200 hover:border-stone-400"}`}
              >
                <input
                  type="radio"
                  name={`${id}-size`}
                  value={size.size}
                  checked={selected}
                  onChange={() => {
                    const next = defaultGarden(size.size);
                    setConfiguration(next);
                    onChange?.(next);
                    setError("");
                  }}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-1 text-xs text-stone-600">
                  <span>{gardenCountLabel(size.size)}</span>
                  {selected ? (
                    <Check size={15} aria-hidden />
                  ) : size.discount > 0 ? (
                    <span>−{size.discount}%</span>
                  ) : null}
                </span>
                <span className="font-display text-lg leading-snug text-stone-900">
                  {size.name}
                </span>
                <span className="flex-1 text-xs leading-relaxed text-stone-600">
                  {size.caption}
                </span>
                <span className="text-sm tabular-nums text-stone-900">
                  {formatPrice(gardenPrice(defaultGarden(size.size)).total)}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-stone-500">
          На карточках — цена предложенного состава. Её можно изменить, выбирая
          наполнение.
        </p>
        <label
          className={`mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm focus-within:ring-2 focus-within:ring-[#687851] ${configuration.size === 0 ? "border-[#687851] bg-[#f1f3eb]" : "border-stone-200"}`}
        >
          <span>
            <input
              type="radio"
              name={`${id}-size`}
              checked={configuration.size === 0}
              onChange={() => {
                const next = defaultGarden(0);
                setConfiguration(next);
                onChange?.(next);
                setError("");
              }}
              className="sr-only"
            />
            Купить детали поштучно
          </span>
          {configuration.size === 0 ? (
            <Check size={15} aria-hidden />
          ) : (
            <Plus size={15} aria-hidden />
          )}
        </label>
      </fieldset>

      <fieldset disabled={pending} className="min-w-0">
        <legend className="mb-2 font-body text-ui uppercase tracking-[0.08em] text-stone-800">
          2. Выберите наполнение
        </legend>
        <p className="mb-4 text-sm leading-relaxed text-stone-600">
          Мы предложили сочетание. Меняйте его на свой вкус — формы и цвета
          подберёт Даша.
        </p>
        <div className="divide-y divide-stone-200">
          {gardenParts.map((part) => (
            <div
              key={part.key}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={`${id}-${part.key}`}
                  className="block text-sm text-stone-900"
                >
                  {part.label}
                </label>
                <p className="mt-1 text-xs leading-relaxed text-stone-600">
                  {part.hint}
                </p>
                <p className="mt-1 text-sm text-stone-700">
                  {formatPrice(part.price)} / шт.
                </p>
              </div>
              <div className="flex shrink-0 items-center rounded-md border border-stone-200">
                <button
                  type="button"
                  disabled={configuration[part.key] === 0}
                  onClick={() =>
                    changePart(part.key, configuration[part.key] - 1)
                  }
                  aria-label={`Уменьшить: ${part.label}`}
                  className="flex h-11 w-10 items-center justify-center text-stone-700 hover:bg-stone-100 disabled:opacity-30"
                >
                  <Minus size={15} />
                </button>
                <input
                  id={`${id}-${part.key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={configuration[part.key] + remaining}
                  value={configuration[part.key]}
                  onChange={(e) => changePart(part.key, Number(e.target.value))}
                  className="h-11 w-10 appearance-none bg-transparent text-center text-sm tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  disabled={remaining <= 0}
                  onClick={() =>
                    changePart(part.key, configuration[part.key] + 1)
                  }
                  aria-label={`Увеличить: ${part.label}`}
                  className="flex h-11 w-10 items-center justify-center text-stone-700 hover:bg-stone-100 disabled:opacity-30"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <p
          aria-live="polite"
          className={`mt-2 text-sm ${valid ? "text-[#526444]" : "text-stone-600"}`}
        >
          {configuration.size === 0
            ? `Выбрано деталей: ${count} из 100 возможных`
            : `Выбрано ${count} из ${configuration.size}${remaining ? ` · Добавьте ещё ${remaining}` : " · Сад собран"}`}
        </p>
        {!valid && configuration.size !== 0 && (
          <p className="mt-2 text-xs text-stone-600">
            Чтобы заменить деталь, сначала уменьшите её количество, затем
            добавьте другую.
          </p>
        )}
      </fieldset>

      <div className="rounded-lg bg-[#f1f3eb] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-stone-700">
              {gardenName(configuration)}
            </p>
            <p className="mt-1 font-display text-price tabular-nums text-stone-900">
              {formatPrice(price.total)}
            </p>
          </div>
          <Sprout
            className="mt-1 shrink-0 text-[#687851]"
            size={26}
            strokeWidth={1.3}
            aria-hidden
          />
        </div>
        {price.saving > 0 && (
          <p className="mt-2 text-sm text-[#526444]">
            <span className="mr-2 text-stone-500 line-through">
              {formatPrice(price.subtotal)}
            </span>
            Экономия {formatPrice(price.saving)} · −{price.discount}%
          </p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-stone-600">
          Цена зависит от состава. Скидка сохраняется при замене деталей в
          выбранном размере.
        </p>
      </div>
      <div className="space-y-3">
        <button
          disabled={!valid || pending}
          aria-busy={pending}
          type="submit"
          className="flex min-h-12 w-full items-center justify-center rounded-md bg-stone-900 px-4 py-4 font-body text-ui uppercase tracking-[0.06em] text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Сохраняю сад…" : saveLabel}
        </button>
        {onCancel && (
          <button
            disabled={pending}
            type="button"
            onClick={onCancel}
            className="min-h-11 w-full text-sm text-stone-600 underline underline-offset-4"
          >
            Отмена
          </button>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        )}
        <p className="text-sm leading-relaxed text-stone-700">
          Изготовление —{" "}
          <strong className="font-medium">3 недели после оплаты.</strong>{" "}
          Кубикам нужно хорошо высохнуть перед обжигом! Срок доставки
          добавляется отдельно.
        </p>
      </div>
    </form>
  );
}
