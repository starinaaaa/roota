"use client";
import { useEffect } from "react";

export default function PaymentReturnBridge({ href }: { href: string }) {
  useEffect(() => {
    try {
      (window.top ?? window).location.replace(href);
    } catch {
      /* Embedded browsers may require a user gesture. */
    }
  }, [href]);
  return (
    <div className="px-5 pt-32 pb-16 text-center space-y-6">
      <h1 className="font-display text-3xl">Возвращаемся к заказу</h1>
      <p>Статус оплаты проверяется у магазина.</p>
      <a href={href} target="_top" className="underline">
        Вернуться к заказу
      </a>
    </div>
  );
}
