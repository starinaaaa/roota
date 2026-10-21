import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { paymentExpired } from "@/lib/payments/model";
import PaymentPanel from "@/components/checkout/PaymentPanel";
import { ensureOrderLink } from "@/lib/order-access";
import { paymentDeliveryIsSeparate } from "@/lib/payments/delivery-summary";
import {
  ownedPayment,
  buildForm,
  orderNumberForPayment,
  paymentMode,
  receiptProfile,
} from "@/lib/payments/robokassa";
export const metadata: Metadata = {
  title: "Оплата заказа",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ failed?: string }>;
}) {
  const payment = await ownedPayment((await params).id);
  if (!payment) notFound();
  const [orderNumber, separateDelivery] = await Promise.all([
    orderNumberForPayment(payment),
    paymentDeliveryIsSeparate(payment),
  ]);
  const base =
    process.env.PAYMENT_BASE_URL ||
    (process.env.VERCEL_BRANCH_URL
      ? `https://${process.env.VERCEL_BRANCH_URL}`
      : "http://localhost:3000");
  const enabled =
    !paymentExpired(payment) &&
    payment.status === "pending" &&
    paymentMode() === payment.mode;
  if (
    enabled &&
    payment.mode === "live" &&
    (!receiptProfile(payment.mode) || !payment.receipt)
  )
    throw new Error("Оплата временно недоступна");
  return (
    <PaymentPanel
      summary={{
        number: orderNumber,
        amount: payment.amount,
        items: payment.items,
        separateDelivery,
      }}
      id={payment.id}
      mode={payment.mode}
      initialStatus={payment.status}
      failed={(await searchParams).failed === "1"}
      initialExpired={paymentExpired(payment)}
      requiresReview={payment.requires_review}
      expiresAt={payment.expires_at}
      orderUrl={
        payment.order_id ? await ensureOrderLink(payment.order_id) : undefined
      }
      form={enabled ? buildForm(payment, base, orderNumber) : undefined}
    />
  );
}
