import { createServer } from "node:http";
import { relayHandler } from "./handler.mjs";
const relay = relayHandler({
  secret: process.env.TELEGRAM_RELAY_SECRET,
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
});
const server = createServer(async (req, res) => {
  const reply = (status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/health")
    return reply(200, { ok: true });
  if (req.method !== "POST" || req.url !== "/notify")
    return reply(404, { ok: false });
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4096) {
        reply(413, { ok: false });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    }
    const result = await relay(
      req.headers.authorization,
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    reply(result.status, result.body);
  } catch {
    reply(400, { ok: false });
  }
});
server.requestTimeout = 20000;
server.headersTimeout = 5000;
server.keepAliveTimeout = 5000;
server.listen(
  Number(process.env.PORT || 8080),
  process.env.HOST || "127.0.0.1",
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
