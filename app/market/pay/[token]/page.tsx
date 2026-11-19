import { notFound } from "next/navigation";
import MarketPayment from "@/components/market/MarketPayment";
export default async function MarketPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const result = (await searchParams).return;
  return <MarketPayment token={token} returning={result === "success"} />;
}
