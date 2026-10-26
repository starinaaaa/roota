import Link from "next/link";
import { notFound } from "next/navigation";
import { plates, money, plateTitle, type Plate } from "../../lib/catalog";
import { BuyPlate, Cart } from "../../components/Shop";
import { Garden, Gallery } from "../../components/Garden";
import { Checkout } from "../../components/Checkout";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const path = (await params).path?.join("/") || "";
  return {
    title:
      path === "product/sad"
        ? "Сад — керамический конструктор"
        : path === "collection/plates"
          ? "Тарелки с историями"
          : path === "catalog"
            ? "Каталог"
            : path === "checkout"
              ? "Оформление"
              : path === "cart"
                ? "Корзина"
                : path.startsWith("product/")
                  ? plates.find((p) => path.endsWith(p.slug))?.name
                  : undefined,
  };
}
function PlateCard({ p }: { p: Plate }) {
  return (
    <article className="product-card">
      <Link className="card-image" href={`/product/${p.slug}`}>
        <img src={p.images[0]} alt={plateTitle(p)} loading="lazy" />
        <span>Рассмотреть ↗</span>
      </Link>
      <div className="card-meta">
        <h3>
          <Link href={`/product/${p.slug}`}>{p.name}</Link>
        </h3>
        <span>{money(p.price)} / шт.</span>
      </div>
      <p>Тарелка с авторским рисунком</p>
    </article>
  );
}
function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Roota ceramics · авторская керамика</p>
          <h1>
            Маленькие{" "}
            <br />
            истории
            <br />
            <span>рядом с вами</span>
          </h1>
          <p>
            Тарелки, которые хочется рассматривать.
            <br />
            Сады, которые можно строить заново.
            <br />
            Керамика, которую я делаю своими руками.
          </p>
          <Link className="button" href="/collection/plates">
            Смотреть коллекцию <span>↗</span>
          </Link>
          <p className="hero-index">01 / Тарелки с историями</p>
        </div>
        <div className="hero-photo">
          <img
            src="/images/about/hero-plates.jpg"
            alt="Авторские тарелки Roota с чёрно-белыми рисунками"
            fetchPriority="high"
          />
          <span>Вещи, у которых есть свой маленький мир</span>
        </div>
      </section>
      <section className="direction-head">
        <p className="eyebrow">Два способа быть рядом</p>
        <h2>
          Одна мастерская.
          <br />
          Много маленьких миров.
        </h2>
        <p>
          В рисунках и формах живут садовники, цветы и немного игры. Выберите
          свою историю.
        </p>
      </section>
      <section className="garden-feature">
        <Link className="feature-photo" href="/product/sad">
          <img
            src="/images/garden/garden-1.webp"
            alt="Пример композиции из деталей Сада"
            loading="lazy"
          />
          <small>Пример композиции</small>
        </Link>
        <div>
          <p className="eyebrow">02 / Керамический конструктор</p>
          <h2>
            Вырастите{" "}
            <br />
            свой Сад
          </h2>
          <p className="intro">
            Найдите равновесие.
            <br />
            Разберите. Начните снова.
          </p>
          <p>
            Стебли-кубики, цветочки и листочки складываются в растения, которых
            ещё не было. Для игры одному или вместе.
          </p>
          <p className="feature-price">Набор из 8 деталей — 2 600 ₽</p>
          <p className="muted">Изготовлю за 3 недели после оплаты</p>
          <Link className="button" href="/product/sad">
            Познакомиться с Садом <span>↗</span>
          </Link>
        </div>
      </section>
      <section className="collection-preview">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Четыре сюжета одной коллекции</p>
            <h2>У каждой — своя история</h2>
          </div>
          <Link className="inline-link" href="/collection/plates">
            Вся коллекция ↗
          </Link>
        </div>
        <div className="product-grid">
          {plates.map((p) => (
            <PlateCard p={p} key={p.slug} />
          ))}
        </div>
      </section>
      <Author />
    </>
  );
}
function Author() {
  return (
    <section className="author">
      <img
        src="/images/about/studio-01.jpg"
        alt="Даша за рабочим столом с расписанными тарелками"
        loading="lazy"
      />
      <div>
        <p className="eyebrow">За каждой вещью — человек</p>
        <h2>Привет, я Даша</h2>
        <p className="intro">Я делаю керамику Roota.</p>
        <p>
          Рисую маленькие истории на тарелках и собираю керамические сады. Мне
          нравится, когда вещь можно долго рассматривать, трогать и открывать
          заново.
        </p>
        <Link className="inline-link" href="/about">
          Заглянуть в мастерскую ↗
        </Link>
      </div>
    </section>
  );
}
function Catalog() {
  return (
    <section className="page">
      <p className="eyebrow">Вещи из мастерской Roota</p>
      <h1>
        Керамика для ваших
        <br />
        маленьких ритуалов
      </h1>
      <nav className="category-nav" aria-label="Коллекции">
        <a href="#plates">Тарелки с историями ↓</a>
        <a href="#garden">Керамический сад ↓</a>
      </nav>
      <div className="section-heading" id="plates">
        <h2>Тарелки с историями</h2>
        <Link href="/collection/plates" className="inline-link">
          О коллекции ↗
        </Link>
      </div>
      <div className="product-grid">
        {plates.map((p) => (
          <PlateCard p={p} key={p.slug} />
        ))}
      </div>
      <article className="catalog-garden" id="garden">
        <Link href="/product/sad">
          <img
            src="/images/garden/garden-1.webp"
            alt="Сад — пример композиции"
            loading="lazy"
          />
        </Link>
        <div>
          <p className="eyebrow">Объекты для игры</p>
          <h2>Сад</h2>
          <p>Керамический конструктор для композиций и игры с равновесием.</p>
          <p className="price">Набор из 8 деталей — 2 600 ₽</p>
          <p className="muted">
            Также наборы на 12, 16 и 24 детали. Отдельные детали — от 250 ₽.
          </p>
          <Link className="button" href="/product/sad">
            Выбрать сад ↗
          </Link>
          <small>На фото — пример композиции</small>
        </div>
      </article>
    </section>
  );
}
function Collection() {
  return (
    <>
      <section className="collection-hero">
        <div>
          <p className="eyebrow">Коллекция тарелок</p>
          <h1>
            У каждого цветка
            <br />
            есть свой садовник
          </h1>
          <p className="intro">
            Четыре рисунка. Четыре маленькие истории о том, как быть рядом.
          </p>
          <p>
            Их можно рассматривать по одной или знакомить друг с другом за одним
            столом.
          </p>
          <a className="inline-link" href="#stories">
            Познакомиться с героями ↓
          </a>
        </div>
        <img
          src="/images/about/hero-plates.jpg"
          alt="Тарелки Roota с сюжетными рисунками"
          fetchPriority="high"
        />
      </section>
      <section id="stories" className="collection-stories">
        {plates.map((p, i) => (
          <article className="collection-story" key={p.slug}>
            <Link href={`/product/${p.slug}`}>
              <img src={p.images[0]} alt={plateTitle(p)} loading="lazy" />
            </Link>
            <div>
              <p className="eyebrow">0{i + 1} / Часть одной истории</p>
              <h2>{p.name}</h2>
              <p>
                {p.description.split(/\n/)[0].slice(0, 240)}
                {p.description.split(/\n/)[0].length > 240 ? "…" : ""}
              </p>
              <p className="feature-price">{money(p.price)} за одну тарелку</p>
              <Link className="button" href={`/product/${p.slug}`}>
                История и покупка <span>↗</span>
              </Link>
            </div>
          </article>
        ))}
      </section>
      <section className="process">
        <div>
          <p className="eyebrow">Из мастерской</p>
          <h2>
            История начинается
            <br />с рук
          </h2>
          <p>
            Форма, рисунок, детали — на фотографиях можно заглянуть в процесс и
            увидеть керамику ближе.
          </p>
        </div>
        <img
          src="/images/about/studio-03.jpg"
          alt="Работа с глиной в мастерской"
          loading="lazy"
        />
        <img
          src={plates[0].images[2]}
          alt="Фрагмент рисунка на тарелке"
          loading="lazy"
        />
      </section>
    </>
  );
}
function Product({ p }: { p: Plate }) {
  return (
    <>
      <nav className="breadcrumbs">
        <Link href="/catalog">Каталог</Link>
        <span>/</span>
        <Link href="/collection/plates">Тарелки</Link>
        <span>/</span>
        {p.name}
      </nav>
      <section className="product-layout plate-product">
        <Gallery images={p.images} name={plateTitle(p)} />
        <div className="plate-purchase">
          <p className="eyebrow">Тарелка с авторским рисунком</p>
          <h1>{p.name}</h1>
          <p className="price">
            {money(p.price)} <small>за одну тарелку</small>
          </p>
          <dl className="specs">
            <div>
              <dt>Размер</dt>
              <dd>{p.dimensions}</dd>
            </div>
            <div>
              <dt>Материал</dt>
              <dd>{p.material}</dd>
            </div>
            {p.dishwasher_safe && (
              <div>
                <dt>Уход</dt>
                <dd>Можно мыть в посудомоечной машине</dd>
              </div>
            )}
            {p.microwave_safe && (
              <div>
                <dt>Использование</dt>
                <dd>Подходит для микроволновой печи</dd>
              </div>
            )}
          </dl>
          <BuyPlate
            name={plateTitle(p)}
            price={p.price}
            image={p.images[0]}
            slug={p.slug}
          />
          <p className="muted">
            Демонстрационная покупка. Наличие на рабочем сайте здесь не
            проверяется.
          </p>
          <a className="inline-link" href="#full-story">
            Прочитать историю ↓
          </a>
          <details className="customize">
            <summary>
              Доставка и уход <span>＋</span>
            </summary>
            <p>
              Стоимость и срок доставки показываются при оформлении до оплаты.
              Избегайте резких перепадов температур.
            </p>
          </details>
        </div>
      </section>
      <section className="story-section plate-story" id="full-story">
        <div>
          <p className="eyebrow">Авторская история</p>
          <h2>{p.name}</h2>
          <img
            src={p.images[1]}
            alt={`Деталь тарелки «${p.name}»`}
            loading="lazy"
          />
        </div>
        <div>
          {p.description
            .split(/\n+/)
            .filter(Boolean)
            .map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          <Link className="inline-link" href="/collection/plates">
            Другие истории коллекции ↗
          </Link>
        </div>
      </section>
    </>
  );
}
function About() {
  return (
    <>
      <section className="page about-intro">
        <p className="eyebrow">Roota · авторская керамика</p>
        <h1>
          Керамика
          <br />и её автор
        </h1>
        <p className="intro">
          Тарелки с историями и сады для игры рождаются в одной мастерской.
        </p>
      </section>
      <Author />
      <section className="photo-pair">
        <figure>
          <img
            src="/images/about/studio-03.jpg"
            alt="Работа с глиной"
            loading="lazy"
          />
          <figcaption>В мастерской</figcaption>
        </figure>
        <figure>
          <img
            src="/images/about/studio-07.jpg"
            alt="Даша с тарелкой у рабочего стола"
            loading="lazy"
          />
          <figcaption>От формы до рисунка</figcaption>
        </figure>
      </section>
      <section className="page">
        <Link className="button" href="/catalog">
          Посмотреть керамику ↗
        </Link>
      </section>
    </>
  );
}
function Delivery() {
  return (
    <section className="page legal">
      <p className="eyebrow">Перед покупкой</p>
      <h1>Доставка и оплата</h1>
      <h2>Сад — под заказ</h2>
      <p>
        Изготовление занимает 3 недели после оплаты. Срок доставки добавляется
        отдельно.
      </p>
      <h2>Доставка</h2>
      <p>
        Стоимость и срок показываются при оформлении до оплаты. Для этой версии
        доступны демонстрационные пункт выдачи и курьер. Цены 350 и 550 ₽ и срок
        3–5 дней — учебные значения, не тариф магазина.
      </p>
      <h2>Оплата на стенде</h2>
      <p>
        Здесь работает локальный симулятор оплаты: без банковских данных и без
        списаний. Настоящие заказы, отправления, подписки и письма не создаются.
      </p>
      <h2>Ваши данные</h2>
      <p>
        Используйте вымышленные контакты. Корзина и поля оформления хранятся в
        sessionStorage этой вкладки. На сервер они не отправляются. Рабочая
        аналитика не подключена.
      </p>
      <Link href="/catalog" className="button">
        Вернуться в каталог ↗
      </Link>
    </section>
  );
}
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const path = (await params).path?.join("/") || "";
  if (!path) return <Home />;
  if (path === "catalog") return <Catalog />;
  if (path === "collection/plates") return <Collection />;
  if (path === "product/sad") return <Garden />;
  if (path === "cart") return <Cart />;
  if (path === "checkout") return <Checkout />;
  if (path === "about") return <About />;
  if (path === "delivery") return <Delivery />;
  const p = plates.find((p) => path === `product/${p.slug}`);
  if (p) return <Product p={p} />;
  notFound();
}
