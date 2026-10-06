import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PaymentPanel from "@/components/checkout/PaymentPanel";
import {
  ownedPayment,
  buildForm,
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
}: {
  params: Promise<{ id: string }>;
}) {
  const payment = await ownedPayment((await params).id);
  if (!payment) notFound();
  const base =
    process.env.PAYMENT_BASE_URL ||
    (process.env.VERCEL_BRANCH_URL
      ? `https://${process.env.VERCEL_BRANCH_URL}`
      : "http://localhost:3000");
  const enabled =
    payment.status === "pending" && paymentMode() === payment.mode;
  if (
    enabled &&
    payment.mode === "live" &&
    (!receiptProfile(payment.mode) || !payment.receipt)
  )
    throw new Error("Оплата временно недоступна");
  return (
    <PaymentPanel
      id={payment.id}
      mode={payment.mode}
      initialStatus={payment.status}
      form={enabled ? buildForm(payment, base) : undefined}
    />
  );
}
