"use client";
import { recentMarketPayment } from "@/components/market/openBank";
import { useEffect, useState } from "react";

export default function PaymentReturnBridge({
  href,
  marketId,
  failed,
}: {
  href: string;
  marketId?: string;
  failed?: boolean;
}) {
  const [destination, setDestination] = useState(href);
  useEffect(() => {
    const previous = marketId && recentMarketPayment(marketId);
    const target = previous
      ? previous + (failed ? "?return=fail" : "?return=success")
      : href;
    setDestination(target);
    try {
      (window.top ?? window).location.replace(target);
    } catch {
      /* Embedded browsers may require a user gesture. */
    }
  }, [href, marketId, failed]);
  return (
    <div className="px-5 pt-32 pb-16 text-center space-y-6">
      <h1 className="font-display text-3xl">Возвращаемся к заказу</h1>
      <p>Статус оплаты проверяется у магазина.</p>
      <a href={destination} target="_top" className="underline">
        Вернуться к заказу
      </a>
    </div>
  );
}
