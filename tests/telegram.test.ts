import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { telegramRelay } from "../supabase/functions/telegram-order-notification/handler.js";
import {
  orderNotificationText,
  sendTelegramMessage,
} from "../lib/telegram-transport";

test("new orders show pending payment and late cancelled payments keep their warning", () => {
  const order = {
    order_number: "GL-TEST",
    total_amount: 221,
    status: "new",
    payment_status: "pending",
  };
  assert.match(
    orderNotificationText(order),
    /Новый заказ GL-TEST[\s\S]*Ожидает оплаты/,
  );
  assert.match(
    orderNotificationText({ ...order, payment_status: "paid" }, "paid"),
    /Заказ оплачен GL-TEST/,
  );
  assert.match(
    orderNotificationText({
      ...order,
      status: "cancelled",
      payment_status: "paid",
    }),
    /Оплата отменённого заказа[\s\S]*Отправка не запускается/,
  );
});

test("Telegram validates provider acknowledgement and redacts failures", async () => {
  const accepted = (async (_url, options) => {
    assert.equal(JSON.parse(String(options?.body)).chat_id, "123");
    return Response.json({ ok: true });
  }) as typeof fetch;
  assert.deepEqual(
    await sendTelegramMessage("secret", "123", "test", accepted),
    { ok: true },
  );
  const denied = (async () =>
    Response.json(
      { ok: false, error_code: 403, description: "private detail" },
      { status: 403 },
    )) as typeof fetch;
  assert.deepEqual(await sendTelegramMessage("secret", "123", "test", denied), {
    ok: false,
    reason: "provider_403",
  });
  const failed = (async () => {
    throw new Error("secret token and customer information");
  }) as typeof fetch;
  assert.deepEqual(await sendTelegramMessage("secret", "123", "test", failed), {
    ok: false,
    reason: "network",
  });
});

test("creation and payment each claim once, while unpaid orders cannot claim payment", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table orders(id uuid primary key,payment_status text not null);
      create table notification_outbox(id uuid primary key default gen_random_uuid(),order_id uuid not null unique references orders(id),state text not null default 'pending',attempts integer not null default 0,updated_at timestamptz not null default now());
      create function claim_notification(p_order uuid) returns uuid language sql as $$ select null::uuid $$;
      insert into orders values('00000000-0000-4000-8000-000000000001','pending');`);
    await db.exec(
      await readFile(
        "supabase/migrations/20261014211434_telegram_notification_events.sql",
        "utf8",
      ),
    );
    const claim = async (event: string) =>
      (
        await db.query<{ id: string | null }>(
          "select claim_notification_event('00000000-0000-4000-8000-000000000001',$1) id",
          [event],
        )
      ).rows[0].id;
    assert.equal(await claim("paid"), null);
    const created = await claim("created");
    assert.ok(created);
    assert.equal(await claim("created"), null);
    await db.exec(
      "update notification_outbox set state='sent'; update orders set payment_status='paid'",
    );
    const paid = await claim("paid");
    assert.ok(paid);
    assert.notEqual(paid, created);
    assert.equal(await claim("paid"), null);
    assert.equal(await claim("created"), null);
    await db.exec("set role anon");
    await assert.rejects(claim("created"), /permission denied/);
  } finally {
    await db.close();
  }
});

test("private relay rejects public callers and never returns Telegram secrets", async () => {
  let calls = 0;
  const relay = telegramRelay("server-secret", async () => {
    calls++;
    return Response.json({
      ok: true,
      result: { text: "private buyer", chat: { id: 123 } },
    });
  });
  assert.equal(
    (await relay(new Request("https://example.test", { method: "POST" })))
      .status,
    401,
  );
  assert.equal(calls, 0);
  const body = {
    token: "123:secret",
    chatId: "123",
    text: "Новый заказ GL-TEST",
  };
  const request = (payload: unknown) =>
    new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: "Bearer server-secret" },
      body: JSON.stringify(payload),
    });
  assert.equal(
    (await relay(request({ ...body, token: "invalid/redirect" }))).status,
    400,
  );
  assert.equal(calls, 0);
  assert.deepEqual(await (await relay(request(body))).json(), { ok: true });
  assert.equal(calls, 1);
});

test("server uses authenticated relay without a second direct Telegram attempt", async () => {
  let calls = 0;
  const mock = (async (url, options) => {
    calls++;
    assert.equal(
      url,
      "https://project.supabase.co/functions/v1/telegram-order-notification",
    );
    assert.equal(
      new Headers(options?.headers).get("Authorization"),
      "Bearer service-key",
    );
    assert.equal(JSON.parse(String(options?.body)).token, "123:secret");
    return Response.json({ ok: true });
  }) as typeof fetch;
  assert.deepEqual(
    await sendTelegramMessage("123:secret", "123", "test", mock, {
      url: "https://project.supabase.co/functions/v1/telegram-order-notification",
      serviceKey: "service-key",
    }),
    { ok: true },
  );
  assert.equal(calls, 1);
});
