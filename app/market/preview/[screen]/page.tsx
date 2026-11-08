import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MarketPreview from "@/components/market/MarketPreview";
import { marketLinks } from "@/lib/market/server";
import {
  marketPreviewScreens,
  type MarketPreviewScreen,
} from "@/lib/market/preview";
export const metadata: Metadata = {
  title: "Демо маркета · Roota",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  if (!Object.hasOwn(marketPreviewScreens, screen)) notFound();
  return (
    <MarketPreview
      key={screen}
      screen={screen as MarketPreviewScreen}
      links={await marketLinks()}
    />
  );
}
