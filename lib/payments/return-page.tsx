import { notFound } from "next/navigation";
import PaymentPanel from "@/components/checkout/PaymentPanel";
import { paymentExpired } from "./model";
import { ownedPayment } from "./robokassa";
export async function PaymentReturn({
  searchParams,
  failed,
}: {
  searchParams: Promise<{ Shp_payment?: string }>;
  failed: boolean;
}) {
  const payment = await ownedPayment((await searchParams).Shp_payment ?? "");
  if (!payment) notFound();
  return (
    <PaymentPanel
      id={payment.id}
      mode={payment.mode}
      initialStatus={payment.status}
      initialExpired={paymentExpired(payment)}
      requiresReview={payment.requires_review}
      expiresAt={payment.expires_at}
      failed={failed}
    />
  );
}
