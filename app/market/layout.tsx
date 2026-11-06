import type { Viewport } from "next";
import "@/components/market/market.css";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="market-app">{children}</div>;
}
