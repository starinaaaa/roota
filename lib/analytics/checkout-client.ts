"use client";
import type { CheckoutProgressInput } from "./checkout-progress";

// Preserve event order, including selection followed immediately by its price.
let queue: Promise<unknown> = Promise.resolve();
export function trackCheckoutProgress(event: CheckoutProgressInput) {
  queue = queue
    .catch(() => {})
    .then(() =>
      fetch("/api/analytics/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        keepalive: true,
        signal: AbortSignal.timeout(4000),
      }),
    )
    .catch(() => {});
}
