import { notFound } from "next/navigation";
import PaymentPanel from "@/components/checkout/PaymentPanel";
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
      failed={failed}
    />
  );
}
