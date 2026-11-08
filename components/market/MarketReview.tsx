"use client";
import { useState } from "react";
import { Creature, MarketBrand, useMarketPoll } from "./shared";
import ReviewPhotos from "./ReviewPhotos";
import { MARKET_REVIEW_TERMS } from "@/lib/market/review-copy";
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
      <section className="market-phone-receipt">
        <div className="market-phone-title">
          <h1>
            {data?.saved ? "Спасибо за ваш отзыв!" : "Как вам наша встреча?"}
          </h1>
          <Creature id={2891} />
        </div>
        {loadError ? (
          <p role="alert">{loadError}</p>
        ) : !data ? (
          <p>Готовим вашу покупку…</p>
        ) : data.saved ? (
          <div role="status">
            <p>
              {data.publicationConsent
                ? "Отзыв передан студии и появится на сайте после проверки."
                : "Отзыв останется только у студии."}
            </p>
            {data.reward?.available ? (
              <>
                <h2>Ваш промокод на 10%</h2>
                <p className="market-promo-code">{data.reward.code}</p>
                <p>
                  До{" "}
                  {new Date(data.reward.expiresAt).toLocaleDateString("ru-RU", {
                    timeZone: "Europe/Moscow",
                  })}
                  . При оформлении укажите телефон из формы отзыва. Скидка на
                  изделия, одно применение, доставка оплачивается полностью.
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
            <p>
              Спасибо, что заглянули на мой первый маркет. Расскажите о встрече
              и о том, как изделие устроилось у вас дома. Любая оценка важна.
            </p>
            <p className="market-small">
              {data.number} ·{" "}
              {data.items
                .map((i) => i.name + (i.quantity > 1 ? ` × ${i.quantity}` : ""))
                .join(", ")}
            </p>
            <form
              aria-busy={busy}
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
                  submission.set("rating", String(f.get("rating") ?? ""));
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
                  const response = await fetch(`/api/market/review/${token}`, {
                    method: "POST",
                    body: submission,
                    signal: AbortSignal.timeout(90000),
                  });
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
                Ваша оценка
                <select
                  name="rating"
                  aria-label="Ваша оценка"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Выберите оценку
                  </option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} из 5
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Впечатления о встрече и изделии
                <textarea name="body" required maxLength={4000} rows={5} />
              </label>
              <ReviewPhotos onChange={setPhotos} disabled={busy} />
              <label>
                Телефон для персонального промокода
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+7"
                  required
                  maxLength={40}
                />
              </label>
              <p className="market-small">{MARKET_REVIEW_TERMS}</p>
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
                  сайте. Без галочки отзыв и фото увидит только студия; промокод
                  всё равно получите.
                </span>
              </label>
              {error ? <p role="alert">{error}</p> : null}
              <button className="market-primary" disabled={busy}>
                {busy
                  ? "Сохраняем отзыв и фото…"
                  : "Отправить отзыв и получить 10%"}
              </button>
            </form>
          </>
        )}
      </section>
      <footer>С теплом, Даша и чудики Roota</footer>
    </main>
  );
}
