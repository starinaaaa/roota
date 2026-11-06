import { marketLinks } from "@/lib/market/server";
import { HelloPage } from "@/components/market/MarketExtras";
export default async function Page() {
  return <HelloPage links={await marketLinks()} />;
}
