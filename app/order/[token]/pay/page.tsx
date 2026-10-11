import { notFound } from "next/navigation";
import { paymentForOrderToken } from "@/lib/order-access";
import { paymentExpired } from "@/lib/payments/model";
import {
  buildForm,
  paymentMode,
  receiptProfile,
} from "@/lib/payments/robokassa";
import { siteUrl } from "@/lib/seo";
import PaymentPanel from "@/components/checkout/PaymentPanel";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Оплата заказа",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function OrderPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payment = await paymentForOrderToken(token);
  if (!payment) notFound();
  const enabled =
    payment.status === "pending" &&
    !paymentExpired(payment) &&
    paymentMode() === "live";
  if (enabled && (!receiptProfile("live") || !payment.receipt))
    throw new Error("Оплата временно недоступна");
  const form = enabled
    ? buildForm(
        payment,
        process.env.PAYMENT_BASE_URL || siteUrl("/"),
        `/order/${token}`,
      )
    : undefined;
  return (
    <PaymentPanel
      id={payment.id}
      mode={payment.mode}
      initialStatus={payment.status}
      initialExpired={paymentExpired(payment)}
      requiresReview={payment.requires_review}
      expiresAt={payment.expires_at}
      form={form}
      orderUrl={`/order/${token}`}
      statusUrl={`/api/order/${token}/payment`}
      returnPaymentUrl={`/order/${token}/pay`}
    />
  );
}
