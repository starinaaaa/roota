import { notFound } from "next/navigation";
import PaymentReturnBridge from "@/components/checkout/PaymentReturnBridge";
import { uuid } from "@/lib/validation";
export async function PaymentReturn({
  searchParams,
  failed,
}: {
  searchParams: Promise<{ Shp_payment?: string; Shp_source?: string }>;
  failed: boolean;
}) {
  const { Shp_payment: id, Shp_source: source } = await searchParams;
  if (source === "market" && uuid.safeParse(id).success)
    return (
      <PaymentReturnBridge href="/market/buy" marketId={id} failed={failed} />
    );
  if (!uuid.safeParse(id).success) notFound();
  // Cross-site payment iframes cannot send the cart's SameSite=Lax cookie.
  // Reveal no payment data and never confirm payment here. The top-level
  // destination checks ownership and the provider-confirmed status.
  return (
    <PaymentReturnBridge href={`/payment/${id}${failed ? "?failed=1" : ""}`} />
  );
}
