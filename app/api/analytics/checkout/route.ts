import { cookies } from "next/headers";
import { checkoutProgressInput } from "@/lib/analytics/checkout-progress";
import { saveCheckoutProgressSql } from "@/lib/analytics/checkout-queries";
import {
  excludeAnalyticsSession,
  exclusionCookie,
} from "@/lib/analytics/exclusion";
import { getPool } from "@/lib/db/pool";
import { isTrustedRequestOrigin } from "@/lib/request-origin";
import { uuid } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isTrustedRequestOrigin(request))
    return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 1024)
    return new Response(null, { status: 413 });
  const raw = await request.text();
  if (raw.length > 1024) return new Response(null, { status: 413 });
  let parsed;
  try {
    parsed = checkoutProgressInput.safeParse(JSON.parse(raw));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!parsed.success) return new Response(null, { status: 400 });
  const jar = await cookies();
  const session = jar.get("cart_session")?.value;
  if (!uuid.safeParse(session).success)
    return new Response(null, { status: 204 });
  try {
    if (jar.get(exclusionCookie)?.value === "1")
      await excludeAnalyticsSession(session!);
    else {
      const { stage, method, point, quote, field, code } = parsed.data;
      if (code || stage === "error_corrected") await getPool().query(`select public.record_checkout_obstacle($1,$2,$3,$4)`, [session, stage, field ?? "order", code ?? "UNKNOWN_ERROR"]);
      const query = {
        text: saveCheckoutProgressSql,
        values: [session, stage, method, point ?? null, quote ?? null],
        query_timeout: 1500,
      };
      await getPool().query(query);
      await getPool().query(
        "delete from public.analytics_checkout_progress where session_id in (select session_id from public.analytics_checkout_progress where updated_at<now()-interval '90 days' limit 100)",
      );
    }
  } catch {
    /* Progress never prevents checkout. */
  }
  return new Response(null, { status: 204 });
}
