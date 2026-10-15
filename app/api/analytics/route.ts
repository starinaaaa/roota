import { analyticsInput } from "@/lib/analytics/model";
import { recordFunnelEvent } from "@/lib/analytics/server";
import { isTrustedRequestOrigin } from "@/lib/request-origin";
export async function POST(request: Request) {
  if (!isTrustedRequestOrigin(request))
    return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 2048)
    return new Response(null, { status: 413 });
  const raw = await request.text();
  if (raw.length > 2048) return new Response(null, { status: 413 });
  let input;
  try {
    input = analyticsInput.safeParse(JSON.parse(raw));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!input.success) return new Response(null, { status: 400 });
  const { page, error: paymentError, ...attribution } = input.data;
  await recordFunnelEvent(
    paymentError
      ? "checkout_error"
      : page === "/checkout"
        ? "checkout_started"
        : "page_view",
    paymentError ?? page,
    attribution,
  );
  return new Response(null, { status: 204 });
}
