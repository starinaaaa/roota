import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { adminRequest, json, marketError } from "@/lib/market/http";
import { marketHistorySale, type MarketHistoryRow } from "@/lib/market/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!(await adminRequest()))
    return json({ error: "Войдите в управление студией" }, 401);
  try {
    const before = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("before"));
    const { rows } = await getPool().query<MarketHistoryRow>(
      `select s.*,i.number intake_number,
        coalesce(i.created_at,s.created_at) order_created_at,
        coalesce(nullif(s.email,''),nullif(i.email,'')) order_email,
        j.state receipt_state,j.registered_at receipt_registered_at,j.verified_at receipt_verified_at
      from public.market_sales s
      left join public.market_intakes i on i.sale_id=s.id
      left join public.market_receipt_jobs j on j.sale_id=s.id
      where (s.created_at,s.id)<(select created_at,id from public.market_sales where id=$1)
      order by s.created_at desc,s.id desc limit 20`,
      [before],
    );
    return json({ history: rows.map(marketHistorySale) });
  } catch (e) {
    return marketError(e);
  }
}
