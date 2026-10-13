import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
const payloadSchema = z.object({
  auth: z.string().regex(/^[a-f0-9]{32}$/i),
  events_by_user: z
    .array(
      z.object({
        events: z
          .array(
            z.object({
              event_name: z.string(),
              event_data: z
                .object({
                  job_id: z.string().optional(),
                  email: z.string().optional(),
                  status: z.string().optional(),
                  metadata: z.record(z.string(), z.string()).optional(),
                })
                .optional(),
            }),
          )
          .max(1000),
      }),
    )
    .max(10),
});
export function parseSignedEmailWebhook(raw: string, key: string) {
  if (!key || raw.length > 1024 * 1024) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const matches = [...raw.matchAll(/"auth"\s*:\s*"([a-f0-9]{32})"/gi)];
    if (matches.length !== 1) return null;
    const match = matches[0],
      start = match.index! + match[0].lastIndexOf(match[1]);
    const signed = raw.slice(0, start) + key + raw.slice(start + 32);
    const expected = createHash("md5").update(signed).digest();
    if (!timingSafeEqual(expected, Buffer.from(parsed.data.auth, "hex")))
      return null;
    return parsed.data.events_by_user
      .flatMap((u) => u.events)
      .filter((e) => e.event_name === "transactional_email_status")
      .map((e) => e.event_data)
      .filter((e) => e !== undefined);
  } catch {
    return null;
  }
}
export function deliveryState(status: string) {
  return (
    (
      {
        delivered: "delivered",
        opened: "delivered",
        clicked: "delivered",
        hard_bounced: "bounced",
        spam: "complained",
        unsubscribed: "unsubscribed",
        invalid: "bounced",
      } as Record<string, string>
    )[status] ?? null
  );
}
