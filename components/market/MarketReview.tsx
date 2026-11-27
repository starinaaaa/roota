"use client";
import { useState } from "react";
import { MarketBrand, useMarketPoll } from "./shared";
import ReviewPhotos from "./ReviewPhotos";
import ReviewIntro from "@/components/review/ReviewIntro";
import { reviewPageArtwork } from "@/lib/review-copy";
import {
  MARKET_REVIEW_INTRO,
  MARKET_REVIEW_TERMS,
  MARKET_REVIEW_TITLE,
} from "@/lib/market/review-copy";
export type MarketReviewState = {
  number: string;
  items: { name: string; quantity: number }[];
  saved: boolean;
  publicationConsent: boolean;
  reward: { code: string; expiresAt: string; available: boolean } | null;
};
export default function MarketReview({
  token,
  preview,
}: {
  token: string;
  preview?: MarketReviewState;
}) {
  const {
    data,
    error: loadError,
    setData,
  } = useMarketPoll<MarketReviewState>(`/api/market/review/${token}`, preview);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="market-phone">
      <header>
        <MarketBrand />
      </header>
      <section className="market-phone-receipt space-y-5">
        <ReviewIntro
          title={
            data?.saved ? "Спасибо, что рассказали 💛" : MARKET_REVIEW_TITLE
          }
          introduction={data && !data.saved ? MARKET_REVIEW_INTRO : undefined}
          artwork={
            data?.saved
              ? reviewPageArtwork.marketThanks
              : reviewPageArtwork.market
          }
        />
        {loadError ? (
          <p role="alert">{loadError}</p>
        ) : !data ? (
          <p>Готовим вашу покупку…</p>
        ) : data.saved ? (
          <div role="status" className="space-y-4">
            <p>
              {data.publicationConsent
                ? "Отзыв передан студии и появится на сайте после проверки."
                : "Отзыв останется только у студии."}
            </p>
            {data.reward?.available ? (
              <>
                <h2 className="text-copy!">Ваш промокод на 10%</h2>
                <p className="market-promo-code inline-block bg-stone-100 px-4 py-2 font-mono">
                  {data.reward.code}
                </p>
                <p>
                  До{" "}
                  {new Date(data.reward.expiresAt).toLocaleDateString("ru-RU", {
                    timeZone: "Europe/Moscow",
                  })}
                  . При оформлении укажите телефон из формы отзыва. Скидка на
                  изделия, одно применение, доставка оплачивается полностью. Код
                  не суммируется с другими промокодами.
                </p>
                <a className="market-primary" href="/catalog">
                  Выбрать керамику ↗
                </a>
              </>
            ) : (
              <p>
                Промокод уже использован, применён к заказу или срок его
                действия завершён.
              </p>
            )}
          </div>
        ) : (
          <>
            <form
              aria-busy={busy}
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const f = new FormData(e.currentTarget);
                if (preview) {
                  setData({
                    ...preview,
                    saved: true,
                    publicationConsent: f.get("publicationConsent") === "on",
                  });
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  const submission = new FormData();
                  submission.set("displayName", String(f.get("name") ?? ""));
                  submission.set("phone", String(f.get("phone") ?? ""));
                  submission.set("body", String(f.get("body") ?? ""));
                  submission.set(
                    "publicationConsent",
                    String(f.get("publicationConsent") === "on"),
                  );
                  submission.set(
                    "accepted",
                    String(f.get("accepted") === "on"),
                  );
                  photos.forEach((file) => submission.append("photos", file));
                  const response = await fetch(
                    `/api/market/review-upload/${token}`,
                    {
                      method: "POST",
                      body: submission,
                      signal: AbortSignal.timeout(90000),
                    },
                  );
                  const result = await response.json();
                  if (!response.ok)
                    throw new Error(
                      result.error ?? "Не удалось сохранить отзыв",
                    );
                  setData(result as MarketReviewState);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Не удалось сохранить отзыв",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Ваше имя
                <input
                  name="name"
                  autoComplete="given-name"
                  required
                  maxLength={80}
                />
              </label>
              <label>
                Ваши впечатления
                <textarea
                  name="body"
                  required
                  maxLength={4000}
                  rows={5}
                  placeholder="Расскажите, как вам керамика"
                />
              </label>
              <ReviewPhotos onChange={setPhotos} disabled={busy} />
              <label>
                Телефон
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+7"
                  required
                  maxLength={40}
                  aria-describedby="market-review-phone-help"
                />
                <span id="market-review-phone-help" className="market-small">
                  Привяжу промокод к этому номеру.
                </span>
              </label>
              <details className="border-y border-stone-200 py-3">
                <summary className="cursor-pointer">
                  В благодарность — 10% на следующий заказ
                </summary>
                <div className="pt-2">
                  <p className="market-small">{MARKET_REVIEW_TERMS}</p>
                </div>
              </details>
              <label className="market-consent">
                <input name="accepted" type="checkbox" required />
                <span>
                  Ознакомлен(а) с{" "}
                  <a
                    href="/personal-data-policy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    политикой обработки данных
                  </a>
                  .
                </span>
              </label>
              <label className="market-consent">
                <input name="publicationConsent" type="checkbox" />
                <span>
                  Разрешаю опубликовать отзыв, имя и приложенные фотографии на
                  сайте. Без галочки отзыв и фото увидит только студия.
                </span>
              </label>
              {error ? <p role="alert">{error}</p> : null}
              <button className="market-primary" disabled={busy}>
                {busy ? "Сохраняем отзыв и фото…" : "Отправить отзыв"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
