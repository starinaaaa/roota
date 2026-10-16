import { notFound } from "next/navigation";
import PaymentReturnBridge from "@/components/checkout/PaymentReturnBridge";
import { uuid } from "@/lib/validation";
export async function PaymentReturn({
  searchParams,
  failed,
}: {
  searchParams: Promise<{ Shp_payment?: string }>;
  failed: boolean;
}) {
  const id = (await searchParams).Shp_payment;
  if (!uuid.safeParse(id).success) notFound();
  // Cross-site payment iframes cannot send the cart's SameSite=Lax cookie.
  // Reveal no payment data and never confirm payment here. The top-level
  // destination checks ownership and the provider-confirmed status.
  return (
    <PaymentReturnBridge href={`/payment/${id}${failed ? "?failed=1" : ""}`} />
  );
}
