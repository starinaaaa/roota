import "@/components/market/market.css";
export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="market-app">{children}</div>;
}
