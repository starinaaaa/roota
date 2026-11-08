import { getPool } from "@/lib/db/pool";
import { json, marketError } from "@/lib/market/http";
import { intakeNumber, type IntakeRow } from "@/lib/market/intake";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!/^[a-f0-9]{64}$/.test(token))
      return json({ error: "Покупка не найдена" }, 404);
    const {
      rows: [r],
    } = await getPool().query<IntakeRow & { sale_token: string | null }>(
      "select i.*,s.token sale_token from market_intakes i left join market_sales s on s.id=i.sale_id where i.token=$1",
      [token],
    );
    if (!r) return json({ error: "Покупка не найдена" }, 404);
    return json({
      number: intakeNumber(r.number),
      amount: r.amount_kopecks / 100,
      method: r.method,
      paid: !!r.paid_at,
      cancelled: !!r.cancelled_at,
      mode: r.mode,
      transfer: r.transfer_details,
      redirectUrl: r.sale_token ? `/market/pay/${r.sale_token}` : null,
    });
  } catch (e) {
    return marketError(e);
  }
}
