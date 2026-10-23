import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/db";
import { excludeAnalyticsSession, exclusionCookie } from "./exclusion";
import { uuid } from "@/lib/validation";

export async function recordFunnelEvent(
  kind: string,
  detail = "",
  attribution?: { source: string; medium: string; campaign: string },
) {
  try {
    const jar = await cookies();
    const session = jar.get("cart_session")?.value;
    if (!uuid.safeParse(session).success) return;
    if (jar.get(exclusionCookie)?.value === "1") {
      await excludeAnalyticsSession(session!);
      return;
    }
    const { error } = await createServerClient()
      .rpc("record_funnel_event", {
        p_session: session,
        p_kind: kind,
        p_detail: detail,
        p_source: attribution?.source ?? "",
        p_medium: attribution?.medium ?? "",
        p_campaign: attribution?.campaign ?? "",
      })
      .abortSignal(AbortSignal.timeout(1500));
    if (error) console.warn("funnel_event_not_recorded");
  } catch {
    /* Analytics never blocks shopping. */
  }
}
