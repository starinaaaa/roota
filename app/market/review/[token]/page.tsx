import { notFound } from "next/navigation";
import MarketReview from "@/components/market/MarketReview";
export const metadata = {
  title: "Ваша встреча с Roota",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  return <MarketReview token={token} />;
}
