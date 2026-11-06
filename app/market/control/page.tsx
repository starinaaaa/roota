import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import MarketControl from "@/components/market/MarketControl";
export const dynamic = "force-dynamic";
export default async function MarketControlPage() {
  if (!(await getAdmin())) redirect("/admin/login");
  return <MarketControl />;
}
