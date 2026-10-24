import { cookies } from "next/headers";
import { getPool } from "@/lib/db/pool";
import { isTrustedRequestOrigin } from "@/lib/request-origin";
import { uuid } from "@/lib/validation";
import {
  checkoutContactInput,
  hasCheckoutContact,
  saveCheckoutContactSql,
} from "@/lib/checkout-contact";
export async function POST(request: Request) {
  if (!isTrustedRequestOrigin(request))
    return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 24576)
    return new Response(null, { status: 413 });
  const raw = await request.text();
  if (raw.length > 24576) return new Response(null, { status: 413 });
  let parsed;
  try {
    parsed = checkoutContactInput.safeParse(JSON.parse(raw));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!parsed.success || Math.abs(Date.now() - parsed.data.capturedAt) > 300000)
    return new Response(null, { status: 400 });
  const session = (await cookies()).get("cart_session")?.value;
  if (!uuid.safeParse(session).success)
    return new Response(null, { status: 204 });
  try {
    const { data, capturedAt } = parsed.data;
    const query = {
      text: saveCheckoutContactSql,
      values: [
        session,
        JSON.stringify(data),
        capturedAt,
        hasCheckoutContact(data),
      ],
      query_timeout: 1500,
    };
    await getPool().query(query);
  } catch {
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 204 });
}
