import test from "node:test";
import assert from "node:assert/strict";
import {
  sendUnisenderEmail,
  type EmailMessage,
} from "../lib/email/unisender-transport";

const message: EmailMessage = {
  to: "buyer@example.com",
  subject: "Заказ",
  html: "<p>Заказ</p>",
  plaintext: "Заказ",
  idempotenceKey: "event-123",
};

test("email uses studio sender, disables template substitution and respects suppressions", async () => {
  const mock = (async (url, options) => {
    assert.equal(
      url,
      "https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json",
    );
    assert.equal(
      new Headers(options?.headers).get("X-API-KEY"),
      "secret-test-key",
    );
    const body = JSON.parse(String(options?.body)).message;
    assert.equal(body.from_email, "hello@roota.moscow");
    assert.equal(body.reply_to, "hello@roota.moscow");
    assert.equal(body.template_engine, "none");
    assert.equal(body.skip_unsubscribe, 0);
    assert.equal(body.bypass_unsubscribed, undefined);
    assert.equal(body.idempotence_key, "event-123");
    assert.equal(options?.cache, "no-store");
    return Response.json({
      status: "success",
      job_id: "job-1",
      emails: [message.to],
    });
  }) as typeof fetch;
  assert.deepEqual(await sendUnisenderEmail("secret-test-key", message, mock), {
    state: "accepted",
    jobId: "job-1",
  });
});

test("provider suppression is a rejection even with HTTP success", async () => {
  const mock = (async () =>
    Response.json({
      status: "success",
      job_id: "job-1",
      emails: [],
      failed_emails: { [message.to]: "unsubscribed" },
    })) as typeof fetch;
  assert.equal(
    (await sendUnisenderEmail("key", message, mock)).state,
    "rejected",
  );
});

test("ambiguous provider failures never trigger a second request or expose raw errors", async () => {
  let calls = 0;
  const mock = (async () => {
    calls++;
    throw new Error("secret-key buyer@example.com");
  }) as typeof fetch;
  assert.deepEqual(await sendUnisenderEmail("key", message, mock), {
    state: "unknown",
  });
  assert.equal(calls, 1);
  const gateway = (async () =>
    Response.json(
      { status: "error", message: "secret" },
      { status: 502 },
    )) as typeof fetch;
  assert.deepEqual(await sendUnisenderEmail("key", message, gateway), {
    state: "unknown",
  });
});

test("invalid email headers and oversized idempotence keys never reach the provider", async () => {
  const mock = (async () => {
    throw new Error("must not call");
  }) as typeof fetch;
  assert.equal(
    (
      await sendUnisenderEmail(
        "key",
        { ...message, subject: "test\r\nBCC: other" },
        mock,
      )
    ).state,
    "rejected",
  );
  assert.equal(
    (
      await sendUnisenderEmail(
        "key",
        { ...message, idempotenceKey: "a".repeat(65) },
        mock,
      )
    ).state,
    "rejected",
  );
});

test("provider projects separate order messages from subscription letters and retain the account fallback", async () => {
  const { emailProviderKey, emailWebhookKeys } =
    await import("../lib/email/provider-config");
  const env = {
    UNISENDER_GO_API_KEY: "account",
    UNISENDER_GO_SERVICE_API_KEY: "orders",
    UNISENDER_GO_MARKETING_API_KEY: "subscriptions",
  };
  assert.equal(emailProviderKey("order_paid", env), "orders");
  for (const kind of [
    "confirm",
    "restock",
    "cart_link",
    "cart_reminder",
    "review_invite",
  ])
    assert.equal(emailProviderKey(kind, env), "subscriptions");
  assert.equal(
    emailProviderKey("order_paid", { UNISENDER_GO_API_KEY: "account" }),
    "account",
  );
  assert.equal(
    emailProviderKey("restock", { UNISENDER_GO_API_KEY: "account" }),
    "account",
  );
  assert.deepEqual(emailWebhookKeys(env), [
    "account",
    "orders",
    "subscriptions",
  ]);
});
