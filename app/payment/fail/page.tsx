import { PaymentReturn } from "@/lib/payments/return-page";
export const metadata = {
  title: "Статус оплаты",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default function FailPage(props: {
  searchParams: Promise<{ Shp_payment?: string }>;
}) {
  return <PaymentReturn {...props} failed={true} />;
}
