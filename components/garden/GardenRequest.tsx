"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { requestGarden } from "@/lib/actions/garden";
import {
  defaultGarden,
  gardenName,
  gardenSummary,
  gardenConfigurationSchema,
  type GardenConfiguration,
} from "@/lib/garden";

export default function GardenRequest({
  telegram,
  configuration = defaultGarden(),
}: {
  telegram: string;
  configuration?: GardenConfiguration;
}) {
  const id = useId();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const complete = gardenConfigurationSchema.safeParse(configuration).success;
  return (
    <div className="space-y-4 border-t border-stone-200 pt-6">
      <p className="font-display text-xl text-stone-900">
        Выберем ваш сад вместе?
      </p>
      <p className="text-sm leading-relaxed text-stone-600">
        Если хочется выбрать конкретные формы и цвета, напишите мне или
        оставьте контакты — я пришлю варианты.
      </p>
      <a
        href={telegram}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center border-b border-stone-400 text-sm text-stone-900"
      >
        Написать мне в Telegram ↗
      </a>
      <details className="group">
        <summary className="cursor-pointer py-2 text-sm text-stone-700 underline underline-offset-4">
          Оставить заявку, чтобы я написала
        </summary>
        {saved ? (
          <p
            role="status"
            className="mt-4 rounded-lg bg-[#f1f3eb] p-4 text-sm leading-relaxed"
          >
            Заявка сохранена. Я напишу вам по указанному контакту и помогу
            выбрать детали.
          </p>
        ) : (
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setError("");
              start(async () => {
                const result = await requestGarden({
                  name: form.get("name"),
                  contact: form.get("contact"),
                  wishes: form.get("wishes"),
                  website: form.get("website"),
                  consent: form.get("consent") === "on",
                  configuration,
                });
                if (result.error) setError(result.error);
                else setSaved(true);
              });
            }}
          >
            <p className="text-xs text-stone-600">
              {gardenName(configuration)} · {gardenSummary(configuration)}
            </p>
            <label htmlFor={`${id}-name`} className="block text-sm">
              Как к вам обращаться
              <input
                id={`${id}-name`}
                name="name"
                required
                maxLength={100}
                autoComplete="given-name"
                className="mt-2 block min-h-11 w-full rounded-md border border-stone-300 bg-white p-3"
              />
            </label>
            <label htmlFor={`${id}-contact`} className="block text-sm">
              Telegram, телефон или email
              <input
                id={`${id}-contact`}
                name="contact"
                required
                minLength={3}
                maxLength={254}
                className="mt-2 block min-h-11 w-full rounded-md border border-stone-300 bg-white p-3"
              />
            </label>
            <label htmlFor={`${id}-wishes`} className="block text-sm">
              Пожелания
              <textarea
                id={`${id}-wishes`}
                name="wishes"
                maxLength={2000}
                rows={3}
                className="mt-2 block w-full rounded-md border border-stone-300 bg-white p-3"
              />
            </label>
            <div hidden>
              <label>
                Сайт
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <label className="flex items-start gap-3 text-xs leading-relaxed text-stone-600">
              <input
                name="consent"
                type="checkbox"
                required
                className="mt-1 accent-stone-900"
              />
              <span>
                Согласен на обработку данных для ответа на заявку согласно{" "}
                <Link
                  href="/personal-data-policy"
                  className="underline underline-offset-2"
                >
                  политике обработки данных
                </Link>
                .
              </span>
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-800">
                {error}
              </p>
            )}
            <button
              disabled={pending || !complete}
              className="min-h-11 rounded-md border border-stone-900 px-5 py-3 text-sm disabled:opacity-40"
            >
              {pending ? "Сохраняю…" : "Отправить заявку"}
            </button>
            {!complete && (
              <p className="text-xs text-stone-600">
                Завершите выбор состава сада перед отправкой заявки.
              </p>
            )}
            <p className="text-xs text-stone-600">
              Заявка не оформляет покупку. Состав и оплату согласуем после
              выбора деталей.
            </p>
          </form>
        )}
      </details>
    </div>
  );
}
