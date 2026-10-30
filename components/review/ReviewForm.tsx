"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { submitReview, type ReviewFormState } from "@/lib/actions/reviews";
import {
  REVIEW_PHOTO_HELP,
  REVIEW_PHOTO_LIMIT,
  reviewPhotoError,
} from "@/lib/reviews";

const inputClass =
  "mt-2 block w-full rounded-none border border-stone-300 bg-transparent px-4 py-3 text-base focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900";

export default function ReviewForm({
  token,
  defaultName,
}: {
  token: string;
  defaultName: string;
}) {
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const previewUrls = useRef<string[]>([]);
  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [name, setName] = useState(defaultName);
  const [body, setBody] = useState("");
  const [rating, setRating] = useState("");
  const [consent, setConsent] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(
    async (previous, form) => {
      form.delete("photos");
      photos.forEach((photo) => form.append("photos", photo.file));
      return submitReview(previous, form);
    },
    {},
  );

  return (
    <form action={action} onReset={(event) => event.preventDefault()} className="space-y-7">
      <input type="hidden" name="token" value={token} />
      <fieldset disabled={pending} className="space-y-7 disabled:opacity-70">
        <label className="block text-ui">
          Ваше имя
          <input
            name="display_name"
            autoComplete="given-name"
            maxLength={80}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
            aria-describedby="review-name-help"
          />
          <span
            id="review-name-help"
            className="mt-2 block text-caption text-stone-600"
          >
            Так подпишем отзыв, если вы разрешите публикацию. Можно указать
            только имя.
          </span>
        </label>
        <label className="block text-ui">
          Ваша оценка
          <select
            name="rating"
            required
            value={rating}
            onChange={(event) => setRating(event.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Выберите оценку
            </option>
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} из 5
              </option>
            ))}
          </select>
        </label>
        <label className="block text-ui">
          Как вам изделие?
          <textarea
            name="body"
            rows={5}
            maxLength={4000}
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Что понравилось? Всё ли оказалось так, как вы ожидали?"
            className={inputClass}
          />
        </label>
        <div className="space-y-3">
          <p className="text-ui">
            Фото изделия у вас дома{" "}
            <span className="text-stone-500">· по желанию</span>
          </p>
          <p id="review-photo-help" className="text-caption text-stone-600">
            На столе, с любимым завтраком или в интерьере — обычного снимка на
            телефон вполне достаточно. {REVIEW_PHOTO_HELP}
          </p>
          <input
            ref={fileInput}
            id="review-photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            aria-label="Добавить фотографии"
            aria-describedby="review-photo-help review-photo-status"
            className="sr-only"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              const error = reviewPhotoError([
                ...photos.map((photo) => photo.file),
                ...selected,
              ]);
              setPhotoError(error);
              if (!error) {
                const added = selected.map((file) => ({
                  file,
                  url: URL.createObjectURL(file),
                }));
                previewUrls.current.push(...added.map((photo) => photo.url));
                setPhotos([...photos, ...added]);
              }
              event.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={photos.length >= REVIEW_PHOTO_LIMIT}
            onClick={() => fileInput.current?.click()}
            className="border border-stone-400 px-5 py-3 text-ui hover:border-stone-900 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            ＋ Добавить фото
          </button>
          <p
            id="review-photo-status"
            aria-live="polite"
            className="text-caption text-stone-600"
          >
            {photos.length
              ? `Добавлено фото: ${photos.length} из ${REVIEW_PHOTO_LIMIT}`
              : "Можно отправить отзыв без фотографий."}
          </p>
          {photoError && (
            <p role="alert" className="text-ui text-red-800">
              {photoError}
            </p>
          )}
          {photos.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo, index) => (
                <li
                  key={photo.url}
                  className="min-w-0 border border-stone-200 p-2"
                >
                  <Image
                    src={photo.url}
                    alt={`Выбранное фото ${index + 1}`}
                    width={160}
                    height={160}
                    unoptimized
                    className="aspect-square w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Убрать фото ${index + 1}: ${photo.file.name}`}
                    onClick={() => {
                      URL.revokeObjectURL(photo.url);
                      previewUrls.current = previewUrls.current.filter(
                        (url) => url !== photo.url,
                      );
                      setPhotos(photos.filter((_, i) => i !== index));
                      setPhotoError(null);
                    }}
                    className="mt-2 w-full py-1 text-caption underline underline-offset-4"
                  >
                    Убрать фото
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="flex items-start gap-3 text-ui leading-relaxed">
          <input
            type="checkbox"
            name="publication_consent"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1 size-4 shrink-0 accent-stone-900"
          />
          <span>
            Разрешаю опубликовать моё имя, текст, оценку и приложенные
            фотографии на сайте Roota. Контакты и номер заказа не публикуются.
          </span>
        </label>
        <p className="text-caption text-stone-600">
          Без разрешения отзыв и фото увидит только студия.{" "}
          <a href="/privacy" className="underline underline-offset-4">
            Политика конфиденциальности
          </a>
        </p>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-ui text-red-800">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full border border-stone-900 bg-stone-900 px-6 py-4 text-ui text-white transition-colors hover:bg-stone-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4"
        aria-live="polite"
      >
        {pending ? "Сохраняем отзыв и фотографии…" : "Отправить отзыв"}
      </button>
    </form>
  );
}
