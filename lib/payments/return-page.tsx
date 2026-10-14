import { notFound } from "next/navigation";
import PaymentPanel from "@/components/checkout/PaymentPanel";
import { paymentExpired } from "./model";
import { ownedPayment, orderNumberForPayment } from "./robokassa";
import { ensureOrderLink } from "@/lib/order-access";
export async function PaymentReturn({
  searchParams,
  failed,
}: {
  searchParams: Promise<{ Shp_payment?: string }>;
  failed: boolean;
}) {
  const payment = await ownedPayment((await searchParams).Shp_payment ?? "");
  if (!payment) notFound();
  const orderNumber = await orderNumberForPayment(payment);
  return (
    <PaymentPanel
      summary={{
        number: orderNumber,
        amount: payment.amount,
        items: payment.items,
      }}
      id={payment.id}
      mode={payment.mode}
      initialStatus={payment.status}
      initialExpired={paymentExpired(payment)}
      requiresReview={payment.requires_review}
      expiresAt={payment.expires_at}
      orderUrl={
        payment.order_id ? await ensureOrderLink(payment.order_id) : undefined
      }
      failed={failed}
    />
  );
}
