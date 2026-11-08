"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { REVIEW_PHOTO_HELP, reviewPhotoError } from "@/lib/reviews";

export default function ReviewPhotos({
  onChange,
  disabled,
}: {
  onChange: (files: File[]) => void;
  disabled: boolean;
}) {
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => urls.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );
  return (
    <fieldset className="market-review-photos" disabled={disabled}>
      <legend>Фотографии · по желанию</legend>
      <p id="market-photo-help" className="market-small">
        Покажите, как изделие устроилось у вас дома. {REVIEW_PHOTO_HELP}
      </p>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        hidden
        aria-label="Добавить фотографии"
        onChange={(event) => {
          const selected = Array.from(event.target.files ?? []);
          const problem = reviewPhotoError([
            ...photos.map((photo) => photo.file),
            ...selected,
          ]);
          setError(problem);
          if (!problem) {
            const added = selected.map((file) => ({
              file,
              url: URL.createObjectURL(file),
            }));
            urls.current.push(...added.map((photo) => photo.url));
            const next = [...photos, ...added];
            setPhotos(next);
            onChange(next.map((photo) => photo.file));
          }
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className="market-secondary"
        onClick={() => input.current?.click()}
        aria-describedby="market-photo-help market-photo-status"
      >
        ＋ Добавить фото
      </button>
      <p id="market-photo-status" className="market-small" aria-live="polite">
        {photos.length
          ? `Добавлено фото: ${photos.length}`
          : "Можно отправить отзыв без фотографий."}
      </p>
      {error ? (
        <p role="alert" className="market-error">
          {error}
        </p>
      ) : null}
      {photos.length ? (
        <ul className="market-review-photo-grid">
          {photos.map((photo, index) => (
            <li key={photo.url}>
              <Image
                src={photo.url}
                alt={`Выбранное фото ${index + 1}`}
                width={160}
                height={160}
                unoptimized
              />
              <button
                type="button"
                className="market-secondary"
                aria-label={`Убрать фото ${index + 1}`}
                onClick={() => {
                  URL.revokeObjectURL(photo.url);
                  urls.current = urls.current.filter(
                    (url) => url !== photo.url,
                  );
                  const next = photos.filter((_, i) => i !== index);
                  setPhotos(next);
                  onChange(next.map((photo) => photo.file));
                  setError(null);
                }}
              >
                Убрать фото
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
