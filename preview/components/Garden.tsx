"use client";
import Link from "next/link";
import { useState } from "react";
import {
  gardenSizes,
  gardenParts,
  defaultGarden,
  gardenCount,
  gardenCountLabel,
  gardenPrice,
  gardenSummary,
  changeGardenPart,
  gardenConfigurationSchema,
  gardenCare,
} from "../lib/garden";
import { money } from "../lib/catalog";
import { useShop } from "./Shop";
export function Gallery({
  images,
  name,
  caption,
  video,
}: {
  images: string[];
  name: string;
  caption?: string;
  video?: { src: string; poster?: string; caption?: string };
}) {
  const [active, setActive] = useState(0);
  return (
    <figure className="gallery">
      <img
        className="gallery-main"
        src={images[active]}
        alt={`${name} — фото ${active + 1}`}
        fetchPriority="high"
      />
      {caption && <figcaption>{caption}</figcaption>}
      {video && (
        <div className="product-video">
          <video
            controls
            playsInline
            preload="none"
            poster={video.poster}
            src={video.src}
          />
          {video.caption && <p>{video.caption}</p>}
        </div>
      )}
      <div className="thumbs">
        {images.map((src, i) => (
          <button
            key={src}
            aria-label={`Фото ${i + 1}: ${name}`}
            aria-pressed={active === i}
            onClick={() => setActive(i)}
          >
            <img src={src} alt="" />
          </button>
        ))}
      </div>
    </figure>
  );
}
export function Garden() {
  const [c, setC] = useState(defaultGarden(8));
  const [added, setAdded] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { add, ready } = useShop();
  const count = gardenCount(c),
    price = gardenPrice(c);
  return (
    <>
      <section className="product-heading">
        <p className="eyebrow">Объекты для игры</p>
        <h1>Сад</h1>
        <p className="intro">
          Керамический конструктор, в котором
          <br className="desktop" /> всё держится на равновесии.
        </p>
      </section>
      <section className="product-layout">
        <Gallery
          images={[1, 2, 3, 4, 5].map((i) => `/images/garden/garden-${i}.webp`)}
          name="Сад"
          caption="Пример композиции. Формы, цвета и количество деталей на фото могут отличаться от выбранного набора."
        />
        <div className="garden-purchase">
          <p className="eyebrow">Выберите, с чего начать</p>
          <h2>Ваш домашний сад</h2>
          <p>
            Собирайте растения из стеблей, цветочков и листочков. Меняйте их
            местами, ищите баланс и стройте заново.
          </p>
          <fieldset className="presets">
            <legend>Готовые наборы</legend>
            {gardenSizes.map((s) => (
              <label
                className={c.size !== 0 && count === s.size ? "selected" : ""}
                key={s.size}
              >
                <input
                  type="radio"
                  disabled={!ready}
                  name="set"
                  checked={c.size !== 0 && count === s.size}
                  onChange={() => {
                    setC(defaultGarden(s.size));
                    setAdded(false);
                  }}
                />
                <span>
                  <b>{gardenCountLabel(s.size)}</b>
                  <small>{s.name}</small>
                </span>
                <strong>
                  {money(gardenPrice(defaultGarden(s.size)).total)}
                </strong>
              </label>
            ))}
          </fieldset>
          <div className="garden-summary" aria-live="polite">
            <p>
              {c.size === 0
                ? "Детали поштучно"
                : `${gardenCountLabel(count)} в вашем саду`}
            </p>
            <p className="composition">{gardenSummary(c)}</p>
            <div className="price">{money(price.total)}</div>
            {price.discount > 0 && (
              <small>Скидка {price.discount}% учтена</small>
            )}
          </div>
          <p className="muted">
            Вы выбираете количество деталей каждого вида. Формы и цвета я
            подбираю на свой вкус.
          </p>
          <button
            className="button"
            disabled={!ready || !gardenConfigurationSchema.safeParse(c).success}
            onClick={() => {
              add(
                {
                  name: `${c.size === 0 ? "Детали сада" : "Сад"} · ${gardenCountLabel(count)}`,
                  price: price.total,
                  image: "/images/garden/garden-1.webp",
                  configuration: c,
                },
                "sad",
              );
              setAdded(true);
            }}
          >
            Добавить в корзину <span>↗</span>
          </button>
          {added && (
            <p role="status">
              Сад добавлен. <Link href="/cart">Перейти в корзину →</Link>
            </p>
          )}
          <p className="lead-time">
            Изготовление — <b>3 недели после оплаты</b>
            <br />
            Плюс срок доставки
          </p>
          <details
            id="garden-custom"
            className="customize"
            open={customizeOpen}
            onToggle={(e) => setCustomizeOpen(e.currentTarget.open)}
          >
            <summary>
              Изменить состав или добавить детали <span>＋</span>
            </summary>
            <p className="muted">
              Можно заменить детали или добавить ещё. Стебель и цветок — по 350
              ₽, лист — 250 ₽.
            </p>
            {gardenParts.map((p) => (
              <div className="part" key={p.key}>
                <label htmlFor={`part-${p.key}`}>
                  {p.label}
                  <small>{money(p.price)} / шт.</small>
                </label>
                <div className="counter">
                  <button
                    aria-label={`Уменьшить: ${p.label}`}
                    disabled={c[p.key] === 0}
                    onClick={() => {
                      setC(changeGardenPart(c, p.key, c[p.key] - 1));
                      setAdded(false);
                    }}
                  >
                    −
                  </button>
                  <input
                    id={`part-${p.key}`}
                    type="number"
                    min="0"
                    max={100 - count + c[p.key]}
                    value={c[p.key]}
                    onChange={(e) => {
                      setC(changeGardenPart(c, p.key, Number(e.target.value)));
                      setAdded(false);
                    }}
                  />
                  <button
                    aria-label={`Увеличить: ${p.label}`}
                    disabled={count >= 100}
                    onClick={() => {
                      setC(changeGardenPart(c, p.key, c[p.key] + 1));
                      setAdded(false);
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
            <p className="muted">
              В наборе от 16 до 23 деталей — скидка 5%, от 24 до 100 — 10% на
              весь состав.
            </p>
          </details>
          <details className="customize">
            <summary>
              Купить детали поштучно <span>＋</span>
            </summary>
            <p>Для добора к вашему саду. В поштучном режиме скидки нет.</p>
            <button
              className="secondary"
              onClick={() => {
                setC(defaultGarden(0));
                setAdded(false);
                setCustomizeOpen(true);
                requestAnimationFrame(() =>
                  document
                    .getElementById("garden-custom")
                    ?.scrollIntoView({ block: "start" }),
                );
              }}
            >
              Выбрать поштучную покупку
            </button>
            <p className="muted">
              После выбора измените количество в блоке «Изменить состав» выше.
            </p>
          </details>
        </div>
      </section>
      <section className="story-section">
        <div>
          <p className="eyebrow">Немного об игре</p>
          <h2>
            Равновесие
            <br />
            приходит не сразу
          </h2>
        </div>
        <div>
          <p>
            Башенки из этих кубиков строить непросто, но и в жизни равновесия
            достичь нелегко.
          </p>
          <p>
            Поставьте стебель на лист, найдите место цветку. Можно собрать
            небольшую композицию и любоваться ею, а можно строить вместе с
            друзьями. Мы обычно играем с 12 деталями.
          </p>
          <p>Сад каждый раз получается новым — даже из тех же самых деталей.</p>
        </div>
      </section>
      <section className="photo-pair">
        <figure>
          <img
            src="/images/garden/garden-3.webp"
            alt="Формы и фактуры деталей сада"
            loading="lazy"
          />
          <figcaption>Пример композиции · детали созданы вручную</figcaption>
        </figure>
        <figure>
          <img
            src="/images/garden/garden-5.webp"
            alt="Ещё одна композиция из керамических деталей"
            loading="lazy"
          />
          <figcaption>Пример композиции · найдите своё равновесие</figcaption>
        </figure>
      </section>
      <section className="faq">
        <h2>До и после покупки</h2>
        <details>
          <summary>Как ухаживать и играть</summary>
          <p>{gardenCare}</p>
        </details>
        <details>
          <summary>Изготовление и доставка</summary>
          <p>
            Изготовление занимает 3 недели после оплаты. Срок доставки
            добавляется отдельно. Стоимость доставки показывается при оформлении
            до оплаты. На этом стенде доставка демонстрационная.
          </p>
        </details>
        <details>
          <summary>Что будет в моём наборе</summary>
          <p>
            Количество стеблей, цветков и листьев указано над ценой. Я подбираю
            формы и цвета на свой вкус. Фотографии показывают примеры
            композиций.
          </p>
        </details>
      </section>
    </>
  );
}
