import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { sendUnisenderEmail } from "../lib/email/unisender-transport";

loadEnvConfig(process.cwd());

async function main() {
  const key = process.env.UNISENDER_GO_API_KEY;
  if (!key) {
    console.error("Email test: UNISENDER_GO_API_KEY is not configured");
    process.exitCode = 1;
    return;
  }
  // Fixed studio recipient. This command cannot send to customers or an arbitrary argument.
  const result = await sendUnisenderEmail(key, {
    to: "hello@roota.moscow",
    subject: "ROOTA — проверка почты",
    html: '<div style="font-family:Arial,sans-serif;color:#292724;max-width:560px;margin:32px auto;padding:24px;border:1px solid #e3ded5"><p style="letter-spacing:4px">ROOTA</p><h1 style="font-size:24px;font-weight:400">Почта студии подключена 🤍</h1><p>Это тестовое письмо от hello@roota.moscow через Unisender Go.</p><p>Ответ на письмо придёт в почту студии. Письмо не относится к заказу и не отправляется покупателям.</p><p><a href="https://roota.moscow">Перейти на сайт ROOTА</a></p></div>',
    plaintext:
      "ROOTA\n\nПочта студии подключена 🤍\n\nЭто тестовое письмо от hello@roota.moscow через Unisender Go. Ответ на письмо придёт в почту студии. Письмо не относится к заказу и не отправляется покупателям.\n\nhttps://roota.moscow",
    idempotenceKey: `setup-${randomUUID()}`,
  });
  if (result.state === "accepted")
    console.info("Email test: accepted by Unisender Go; job ID", result.jobId);
  else {
    console.error(
      "Email test:",
      result.state,
      result.state === "rejected"
        ? { code: result.code, httpStatus: result.httpStatus }
        : "Check delivery status before retrying",
    );
    process.exitCode = 1;
  }
}
void main();
