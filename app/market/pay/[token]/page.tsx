import { notFound } from "next/navigation";
import { getSiteContent } from "@/lib/site";
import { defaultSite } from "@/lib/site-schema";
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
  const { instagram } = await getSiteContent().catch(() => defaultSite);
  return <MarketPayment instagram={instagram} token={token} returning={result === "success"} />;
}
