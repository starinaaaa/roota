import { createHash, timingSafeEqual } from "node:crypto";
const digest = (value) => createHash("sha256").update(value).digest();
export function relayHandler(config, request = fetch) {
  if (
    !config.secret ||
    config.secret.length < 32 ||
    !config.token ||
    !config.chatId
  )
    throw Error("RELAY_NOT_CONFIGURED");
  const inflight = new Map();
  return async (authorization, body) => {
    if (
      !timingSafeEqual(
        digest(authorization || ""),
        digest("Bearer " + config.secret),
      )
    )
      return { status: 401, body: { ok: false } };
    if (
      !body ||
      Object.keys(body).some((k) => !["text", "key"].includes(k)) ||
      typeof body.text !== "string" ||
      !body.text ||
      body.text.length > 1500 ||
      typeof body.key !== "string" ||
      !/^[a-f0-9-]{36}$/.test(body.key)
    )
      return { status: 400, body: { ok: false } };
    const known = inflight.get(body.key);
    if (known) return known;
    const result = (async () => {
      try {
        const response = await request(
          `https://api.telegram.org/bot${config.token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: config.chatId, text: body.text }),
            signal: AbortSignal.timeout(15000),
          },
        );
        const data = await response.json();
        return response.ok && data.ok === true
          ? { status: 200, body: { ok: true } }
          : { status: 502, body: { ok: false } };
      } catch {
        return { status: 503, body: { ok: false } };
      }
    })();
    inflight.set(body.key, result);
    // Coalesce concurrent retries. PostgreSQL's persistent outbox remains the
    // authority; a network timeout can still leave provider delivery unknown.
    const timer = setTimeout(() => inflight.delete(body.key), 300000);
    timer.unref();
    if (inflight.size > 10000) inflight.delete(inflight.keys().next().value);
    return result;
  };
}
