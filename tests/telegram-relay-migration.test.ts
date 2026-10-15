import test from "node:test";
import assert from "node:assert/strict";
import { relayHandler } from "../services/telegram-relay/handler.mjs";
import { sendTelegramMessage } from "../lib/telegram-transport";

test("replacement relay authorizes only the studio chat, coalesces retries and hides credentials", async () => {
  let calls = 0;
  const secret = "local-test-secret-at-least-thirty-two-characters";
  const handler = relayHandler(
    { secret, token: "123:test-only-token", chatId: "123" },
    async (url, options) => {
      calls++;
      assert.equal(
        url,
        "https://api.telegram.org/bot123:test-only-token/sendMessage",
      );
      assert.deepEqual(JSON.parse(String(options?.body)), {
        chat_id: "123",
        text: "Проверка переноса",
      });
      return Response.json({ ok: true });
    },
  );
  const body = {
    text: "Проверка переноса",
    key: "00000000-0000-4000-8000-000000000001",
  };
  assert.equal((await handler("", body)).status, 401);
  assert.equal(
    (await handler("Bearer " + secret, { ...body, token: "different" })).status,
    400,
  );
  const results = await Promise.all([
    handler("Bearer " + secret, body),
    handler("Bearer " + secret, body),
  ]);
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.status === 200));
  assert.ok(results.every((r) => JSON.stringify(r.body) === '{"ok":true}'));
  const request = (async (_url: unknown, options: RequestInit) => {
    const payload = JSON.parse(String(options.body));
    assert.deepEqual(payload, body);
    assert.ok(!("token" in payload));
    assert.ok(!("chatId" in payload));
    return Response.json({ ok: true });
  }) as typeof fetch;
  assert.deepEqual(
    await sendTelegramMessage("unused", "unused", body.text, request, {
      url: "https://notify.example.invalid/notify",
      serviceKey: secret,
      protocol: "fixed-chat",
      idempotencyKey: body.key,
    }),
    { ok: true },
  );
});
