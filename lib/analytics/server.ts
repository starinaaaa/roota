import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";

export async function recordFunnelEvent(
  kind: string,
  detail = "",
  attribution?: { source: string; medium: string; campaign: string },
) {
  try {
    const session = (await cookies()).get("cart_session")?.value;
    if (!uuid.safeParse(session).success) return;
    const { error } = await createServerClient().rpc("record_funnel_event", {
      p_session: session,
      p_kind: kind,
      p_detail: detail,
      p_source: attribution?.source ?? "",
      p_medium: attribution?.medium ?? "",
      p_campaign: attribution?.campaign ?? "",
    });
    if (error) console.warn("funnel_event_not_recorded");
  } catch {
    /* Analytics never blocks shopping. */
  }
}
