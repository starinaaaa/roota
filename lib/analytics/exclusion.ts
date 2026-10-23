import "server-only";
import { createHash } from "node:crypto";
import { getPool } from "@/lib/db/pool";

export const exclusionCookie = "analytics_excluded";

export async function excludeAnalyticsSession(session: string) {
  const query = {
    text: "insert into public.analytics_excluded_sessions(id) values($1) on conflict do nothing",
    values: [createHash("md5").update(session).digest("hex")],
    query_timeout: 1500,
  };
  await getPool().query(query);
}
