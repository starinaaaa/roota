"use client";
import { useEffect, useState } from "react";
import type { PublicSale } from "@/lib/market/model";
import { money } from "@/lib/market/model";

export function Creature({
  id = 2899,
  className = "",
}: {
  id?: number;
  className?: string;
}) {
  // The original transparent pencil drawings are cropped and losslessly resized.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`market-creature ${className}`}
      src={`/images/market/creature-${id}.webp`}
      alt=""
      aria-hidden="true"
    />
  );
}
export function MarketBrand({ linked = true }: { linked?: boolean }) {
  if (!linked) return <span className="market-brand">Roota</span>;
  return (
    <a
      className="market-brand"
      href="https://roota.moscow/"
      aria-label="Roota — на главную"
    >
      Roota
    </a>
  );
}
export function QrCode({ value }: { value: string }) {
  const [code, setCode] = useState<{ value: string; data: string } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    import("qrcode")
      .then((qr) =>
        qr.toDataURL(value, {
          width: 600,
          margin: 4,
          errorCorrectionLevel: "M",
          color: { dark: "#222322", light: "#ffffff00" },
        }),
      )
      .then((data) => {
        if (active) {
          setCode({ value, data });
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [value]);
  // Never display a previous purchase's QR while a new one is being generated.
  return code?.value === value ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="market-qr"
      src={code.data}
      alt="QR-код для открытия ссылки"
    />
  ) : (
    <div className="market-qr-placeholder" role="status">
      {failed ? "Не удалось показать код. Обновите страницу" : "Готовим код…"}
    </div>
  );
}
export function ReceiptItems({
  sale,
}: {
  sale: Pick<PublicSale, "items" | "amount">;
}) {
  return (
    <ul className="market-receipt-items">
      {sale.items.map((item, index) => (
        <li key={index}>
          <span>
            {item.name}
            {item.quantity > 1 ? ` × ${item.quantity}` : ""}
          </span>
          <strong>{money(item.sum)}</strong>
        </li>
      ))}
    </ul>
  );
}
export async function marketFetch<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(10000),
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Не удалось связаться со студией");
  return data as T;
}
export function useMarketPoll<T>(url: string, preview?: T) {
  const [data, setData] = useState<T | null>(preview ?? null),
    [error, setError] = useState("");
  useEffect(() => {
    if (preview !== undefined) return;
    let active = true,
      timeout: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    async function poll() {
      controller = new AbortController();
      const deadline = setTimeout(() => controller?.abort(), 8000);
      try {
        const next = await marketFetch<T>(url, undefined, controller.signal);
        if (active) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Проверяем соединение…");
      } finally {
        clearTimeout(deadline);
        if (active) timeout = setTimeout(poll, 1500);
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller?.abort();
    };
  }, [url, preview]);
  return { data, error, setData };
}
export function useSaleExpired(sale: PublicSale | null) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Boolean(
    sale?.status === "pending" && now && Date.parse(sale.expiresAt) <= now,
  );
}
