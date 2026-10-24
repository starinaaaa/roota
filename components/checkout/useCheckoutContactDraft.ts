"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckoutContactData } from "@/lib/checkout-contact";
export function useCheckoutContactDraft(
  data: CheckoutContactData,
  enabled: boolean,
) {
  const latest = useRef({ data, enabled, capturedAt: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef("");
  const timestamp = useRef(0);
  const [error, setError] = useState("");
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const current = latest.current;
    if (!current.enabled) return;
    const body = JSON.stringify(current.data);
    if (body === sent.current) return;
    sent.current = body;
    const attempt = current.capturedAt;
    void fetch("/api/checkout/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capturedAt: attempt,
        data: current.data,
      }),
      keepalive: true,
      signal: AbortSignal.timeout(5000),
    })
      .then((response) => {
        if (!response.ok) throw Error("SAVE_FAILED");
        if (timestamp.current === attempt) setError("");
      })
      .catch(() => {
        if (timestamp.current !== attempt) return;
        if (sent.current === body) sent.current = "";
        setError(
          "Не удалось сохранить черновик на сервере. При следующем изменении попробуем снова; оформление заказа доступно.",
        );
      });
  }, []);
  useEffect(() => {
    if (latest.current.data !== data || !timestamp.current)
      timestamp.current = Math.max(Date.now(), timestamp.current + 1);
    latest.current = { data, enabled, capturedAt: timestamp.current };
    if (!enabled) return;
    timer.current = setTimeout(flush, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, enabled, flush]);
  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [flush]);
  return { flush, error };
}
