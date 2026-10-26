"use client";
import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { money } from "../lib/catalog";
import { gardenKey, type GardenConfiguration } from "../lib/garden";
import { useSessionState } from "./useSessionState";
export type Item = {
  key: string;
  name: string;
  price: number;
  image: string;
  qty: number;
  configuration?: GardenConfiguration;
};
type Context = {
  items: Item[];
  add: (item: Omit<Item, "qty" | "key">, key: string) => void;
  remove: (key: string) => void;
  change: (key: string, delta: number) => void;
  ready: boolean;
};
const emptyItems: Item[] = [];
function isItems(value: unknown): value is Item[] {
  return (
    Array.isArray(value) &&
    value.every(
      (i) =>
        i &&
        typeof i.key === "string" &&
        typeof i.name === "string" &&
        Number.isFinite(i.price) &&
        i.price > 0 &&
        Number.isInteger(i.qty) &&
        i.qty > 0 &&
        i.qty <= 100 &&
        typeof i.image === "string" &&
        i.image.startsWith("/"),
    )
  );
}
const Shop = createContext<Context | null>(null);
export function useShop() {
  return useContext(Shop)!;
}
export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems, ready] = useSessionState<Item[]>(
    "roota:preview:cart:v1",
    emptyItems,
    isItems,
  );
  const add: Context["add"] = (item, key) =>
    setItems((old) => {
      const id = item.configuration
        ? key + ":" + gardenKey(item.configuration)
        : key;
      const found = old.find((i) => i.key === id);
      return found
        ? old.map((i) =>
            i.key === id ? { ...i, qty: Math.min(100, i.qty + 1) } : i,
          )
        : [...old, { ...item, key: id, qty: 1 }];
    });
  return (
    <Shop.Provider
      value={{
        items,
        ready,
        add,
        remove: (key) => setItems((old) => old.filter((i) => i.key !== key)),
        change: (key, delta) =>
          setItems((old) =>
            old
              .map((i) =>
                i.key === key
                  ? { ...i, qty: Math.max(0, Math.min(100, i.qty + delta)) }
                  : i,
              )
              .filter((i) => i.qty > 0),
          ),
      }}
    >
      {children}
    </Shop.Provider>
  );
}
export function Navigation() {
  const { items, ready } = useShop();
  return (
    <header className="nav" data-ready={ready}>
      <Link className="wordmark" href="/">
        Roota<span>ceramics</span>
      </Link>
      <nav aria-label="Основная навигация">
        <Link href="/catalog">Каталог</Link>
        <Link href="/product/sad">Сад</Link>
        <Link href="/about">О Даше</Link>
      </nav>
      <Link className="cart-link" href="/cart">
        Корзина <span>{items.reduce((n, i) => n + i.qty, 0)}</span>
      </Link>
    </header>
  );
}
export function BuyPlate({
  name,
  price,
  image,
  slug,
}: {
  name: string;
  price: number;
  image: string;
  slug: string;
}) {
  const { add, ready } = useShop();
  const [added, setAdded] = useState(false);
  return (
    <div className="buy">
      <button
        className="button"
        disabled={!ready}
        onClick={() => {
          add({ name, price, image }, slug);
          setAdded(true);
        }}
      >
        Добавить в корзину <span>↗</span>
      </button>
      {added && (
        <p role="status">
          Добавлено. <Link href="/cart">Перейти в корзину →</Link>
        </p>
      )}
    </div>
  );
}
export function Cart() {
  const { items, ready, remove, change } = useShop();
  return (
    <section className="page">
      <p className="eyebrow">Ваш выбор</p>
      <h1>Корзина</h1>
      {!ready ? (
        <p>Загружаем корзину…</p>
      ) : !items.length ? (
        <div className="empty">
          <p>Здесь появятся ваши тарелки и сад.</p>
          <Link className="button" href="/catalog">
            Посмотреть керамику ↗
          </Link>
        </div>
      ) : (
        <div className="checkout-grid">
          <div>
            {items.map((i) => (
              <article className="cart-row" key={i.key}>
                <img src={i.image} alt={i.name} />
                <div>
                  <h2>{i.name}</h2>
                  <p>
                    {money(i.price)} /{" "}
                    {i.configuration
                      ? i.configuration.size === 0
                        ? "выбранный состав"
                        : "набор"
                      : "шт."}
                  </p>
                  <div className="counter">
                    <button
                      aria-label={`Уменьшить: ${i.name}`}
                      onClick={() => change(i.key, -1)}
                    >
                      −
                    </button>
                    <span>{i.qty}</span>
                    <button
                      aria-label={`Увеличить: ${i.name}`}
                      onClick={() => change(i.key, 1)}
                    >
                      +
                    </button>
                  </div>
                  <button className="text-button" onClick={() => remove(i.key)}>
                    Удалить
                  </button>
                </div>
                <strong>{money(i.price * i.qty)}</strong>
              </article>
            ))}
          </div>
          <aside className="summary">
            <h2>Ваш заказ</h2>
            <p>
              Изделия{" "}
              <strong>
                {money(items.reduce((s, i) => s + i.price * i.qty, 0))}
              </strong>
            </p>
            <p>
              Доставка <span>на следующем шаге</span>
            </p>
            {items.some((i) => i.configuration) && (
              <p className="muted">
                Сад изготовлю за 3 недели после оплаты. Срок доставки
                добавляется отдельно.
              </p>
            )}
            <Link href="/checkout" className="button">
              Перейти к оформлению ↗
            </Link>
            <p className="muted">
              На стенде заказ останется только в вашем браузере.
            </p>
          </aside>
        </div>
      )}
    </section>
  );
}
