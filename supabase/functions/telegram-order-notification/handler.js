// Private server-to-server transport: no credentials or request bodies are logged.
export function telegramRelay(serviceKey, request = fetch) {
  return async (req) => {
    const authorization = req.headers.get("authorization") || "";
    let serverCaller = Boolean(
      serviceKey && authorization === `Bearer ${serviceKey}`,
    );
    // This function MUST retain verify_jwt=true at the Supabase gateway.
    // The gateway verifies signatures; legacy service JWTs may differ from the
    // runtime's default service key after key migrations, so also check their role.
    if (!serverCaller && /^Bearer /i.test(authorization)) {
      try {
        const payload = authorization.slice(7).split(".")[1];
        const claims = JSON.parse(
          atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
        );
        serverCaller =
          claims.role === "service_role" && claims.iss === "supabase";
      } catch {
        /* Public and malformed tokens are not server credentials. */
      }
    }
    if (!serverCaller) return Response.json({ ok: false }, { status: 401 });
    if (req.method !== "POST") return new Response(null, { status: 405 });
    if (Number(req.headers.get("content-length") || 0) > 16384)
      return new Response(null, { status: 413 });
    try {
      const raw = await req.text();
      if (raw.length > 16384) return new Response(null, { status: 413 });
      const { token, chatId, text } = JSON.parse(raw);
      if (
        typeof token !== "string" ||
        !/^\d+:[A-Za-z0-9_-]+$/.test(token) ||
        typeof chatId !== "string" ||
        !/^-?\d+$/.test(chatId) ||
        typeof text !== "string" ||
        !text ||
        text.length > 4096
      )
        return Response.json({ ok: false }, { status: 400 });
      const response = await request(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const result = await response.json();
      // Return only a safe outcome. Never echo Telegram's payload or credentials.
      return Response.json({
        ok: response.ok && result.ok === true,
        error_code:
          Number(result.error_code) ||
          (response.ok ? undefined : response.status),
      });
    } catch {
      return Response.json({ ok: false }, { status: 502 });
    }
  };
}
