import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  sendStudioNotification,
  processStudioNotifications,
  studioEmailMessage,
  applyStudioDeliveryEvent,
} from "../lib/email/studio-notifications";
const socket = process.env.ROOTA_MIGRATION_TEST_SOCKET;
const env = {
  NOTIFICATIONS_ENABLED: "true",
  STUDIO_NOTIFICATION_CHANNEL: "email",
  APP_ENV: "migration",
  UNISENDER_GO_SERVICE_API_KEY: "dummy-service-key",
  NEXT_PUBLIC_SITE_URL: "https://stage.example.invalid",
};

test("studio mail contains only operational fields and always targets the owner", () => {
  const order = {
    order_number: "TEST-1",
    total_amount: 100,
    status: "new",
    payment_status: "pending",
    customer_name: "PRIVATE_BUYER",
    customer_phone: "PRIVATE_PHONE",
    customer_email: "PRIVATE_EMAIL",
  };
  const message = studioEmailMessage(order, "created", randomUUID(), env);
  assert.equal(message.to, "hello@roota.moscow");
  assert.match(message.subject, /ПРОВЕРКА ПЕРЕНОСА/);
  assert.match(message.plaintext, /https:\/\/stage.example.invalid\/admin/);
  assert.doesNotMatch(JSON.stringify(message), /PRIVATE_/);
});

test(
  "studio outbox atomically records created/paid, coalesces senders and never retries unknown delivery",
  { skip: !socket },
  async () => {
    const config = { host: socket, port: 55441, user: "roota_test" },
      database = "roota_studio_" + randomUUID().replaceAll("-", "");
    const control = new Pool({ ...config, database: "postgres" });
    let db: Pool | undefined;
    try {
      await control.query(`create database ${database}`);
      db = new Pool({ ...config, database, max: 4 });
      await db.query(await readFile("database/schema.sql", "utf8"));
      await db.query(
        await readFile("database/studio-notifications.sql", "utf8"),
      );
      const addOrder = async () =>
        (
          await db!.query(
            "with o as (insert into orders(customer_name,customer_phone,total_amount,delivery_type) values('PRIVATE_BUYER','PRIVATE_PHONE',100,'pickup') returning id) insert into notification_outbox(order_id) select id from o returning order_id as id",
          )
        ).rows[0].id as string;
      let calls = 0;
      const request = (async (_url: unknown, options?: RequestInit) => {
        calls++;
        const payload = JSON.parse(String(options?.body));
        assert.doesNotMatch(JSON.stringify(payload), /PRIVATE_/);
        assert.equal(payload.message.recipients[0].email, "hello@roota.moscow");
        return Response.json({
          status: "success",
          job_id: "test-job-" + calls,
          emails: ["hello@roota.moscow"],
        });
      }) as typeof fetch;
      const id = await addOrder();
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from notification_outbox where order_id=$1",
            [id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        await sendStudioNotification(db, id, "paid", env, request),
        "busy",
      );
      const results = await Promise.all([
        sendStudioNotification(db, id, "created", env, request),
        sendStudioNotification(db, id, "created", env, request),
      ]);
      assert.deepEqual(results.sort(), ["busy", "sent"]);
      assert.equal(calls, 1);
      assert.equal(
        await sendStudioNotification(db, id, "created", env, request),
        "busy",
      );
      await db.query("update orders set payment_status='paid' where id=$1", [
        id,
      ]);
      await db.query("update orders set payment_status='paid' where id=$1", [
        id,
      ]);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from notification_outbox where order_id=$1 and event='paid'",
            [id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        await sendStudioNotification(db, id, "paid", env, request),
        "sent",
      );
      assert.equal(calls, 2);
      const uncertain = await addOrder();
      const timeout = (async () => {
        calls++;
        throw Error("timeout-test-only");
      }) as typeof fetch;
      assert.equal(
        await sendStudioNotification(db, uncertain, "created", env, timeout),
        "unknown",
      );
      assert.equal(
        await sendStudioNotification(db, uncertain, "created", env, request),
        "unknown",
      );
      assert.equal(calls, 3);
      await db.query(
        "update notification_outbox set state='sending',attempts=5,updated_at=now()-interval '6 minutes' where order_id=$1",
        [uncertain],
      );
      await processStudioNotifications(db, env, request);
      assert.equal(
        (
          await db.query(
            "select state from notification_outbox where order_id=$1",
            [uncertain],
          )
        ).rows[0].state,
        "unknown",
      );
      assert.equal(calls, 3);
      const rejected = await addOrder();
      const reject = (async () => {
        calls++;
        return Response.json({ status: "error", code: 400 }, { status: 400 });
      }) as typeof fetch;
      assert.equal(
        await sendStudioNotification(db, rejected, "created", env, reject),
        "failed",
      );
      assert.equal(
        await sendStudioNotification(db, rejected, "created", env, request),
        "busy",
      );
      assert.equal(calls, 4);
      await db.query(
        "update notification_outbox set updated_at=now()-interval '6 minutes' where order_id=$1",
        [rejected],
      );
      assert.equal(
        await sendStudioNotification(db, rejected, "created", env, request),
        "sent",
      );
      assert.equal(calls, 5);
      const notification = (
        await db.query("select id from notification_outbox where order_id=$1", [
          uncertain,
        ])
      ).rows[0].id;
      const event = {
        email: "someone@example.invalid",
        job_id: "test-job-delivered",
        metadata: { studio_notification_id: notification },
      };
      await applyStudioDeliveryEvent(db, event, "delivered");
      assert.equal(
        (
          await db.query("select state from notification_outbox where id=$1", [
            notification,
          ])
        ).rows[0].state,
        "unknown",
      );
      event.email = "hello@roota.moscow";
      await applyStudioDeliveryEvent(db, event, "delivered");
      const delivered = (
        await db.query(
          "select state,delivered_at,provider_job_id from notification_outbox where id=$1",
          [notification],
        )
      ).rows[0];
      assert.equal(delivered.state, "sent");
      assert.ok(delivered.delivered_at);
      assert.equal(delivered.provider_job_id, event.job_id);
      await applyStudioDeliveryEvent(db, event, "delivered");
      assert.equal(
        (
          await db.query(
            "select delivered_at from notification_outbox where id=$1",
            [notification],
          )
        ).rows[0].delivered_at.toISOString(),
        delivered.delivered_at.toISOString(),
      );
      // Telegram uses the same durable claim. Relay failures may be partial
      // delivery, so automatic retries must not send duplicate studio messages.
      const telegramEnv = {
        ...env,
        STUDIO_NOTIFICATION_CHANNEL: "telegram",
        TELEGRAM_BOT_TOKEN: "123:dummy",
        TELEGRAM_CHAT_ID: "123",
        TELEGRAM_RELAY_KEY: "dummy-relay-key",
      };
      let telegramCalls = 0;
      const telegramRequest = (async (url, options) => {
        telegramCalls++;
        assert.equal(
          String(url),
          "https://tntzcgdakwmzmoygmlur.supabase.co/functions/v1/telegram-order-notification",
        );
        assert.equal(
          new Headers(options?.headers).get("authorization"),
          "Bearer dummy-relay-key",
        );
        const body = JSON.parse(String(options?.body));
        assert.equal(body.chatId, "123");
        assert.match(body.text, /Новый заказ/);
        assert.doesNotMatch(body.text, /PRIVATE_/);
        return Response.json({ ok: true });
      }) as typeof fetch;
      const telegramOrder = await addOrder();
      const concurrent = await Promise.all([
        sendStudioNotification(
          db,
          telegramOrder,
          "created",
          telegramEnv,
          telegramRequest,
        ),
        sendStudioNotification(
          db,
          telegramOrder,
          "created",
          telegramEnv,
          telegramRequest,
        ),
      ]);
      assert.deepEqual(concurrent.sort(), ["busy", "sent"]);
      assert.equal(telegramCalls, 1);
      assert.equal(
        (
          await db.query(
            "select provider_job_id from notification_outbox where order_id=$1",
            [telegramOrder],
          )
        ).rows[0].provider_job_id,
        "telegram",
      );
      const partialOrder = await addOrder();
      const partial = (async () => {
        telegramCalls++;
        return Response.json({ ok: false, error_code: 403 });
      }) as typeof fetch;
      assert.equal(
        await sendStudioNotification(
          db,
          partialOrder,
          "created",
          telegramEnv,
          partial,
        ),
        "unknown",
      );
      assert.equal(
        await sendStudioNotification(
          db,
          partialOrder,
          "created",
          telegramEnv,
          telegramRequest,
        ),
        "unknown",
      );
      assert.equal(telegramCalls, 2);
    } finally {
      await db?.end();
      await control.query(`drop database if exists ${database}`);
      await control.end();
    }
  },
);
