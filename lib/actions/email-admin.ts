"use server";
import { deliveryEmailUpdate } from "@/lib/delivery/customer-parcels";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { emailProviderKey } from "@/lib/email/provider-config";
import { renderEmail, templateKinds } from "@/lib/email/templates";
import { sendUnisenderEmail } from "@/lib/email/unisender-transport";
import { randomUUID } from "node:crypto";
import { siteUrl } from "@/lib/seo";
import { studioEmailMessage } from "@/lib/email/studio-notifications";
import { LEGAL_VERSION } from "@/lib/legal";
import { ozonTrackingHint } from "@/lib/delivery/tracking";

export async function testStudioNotification() {
  await requireAdmin();
  const key = emailProviderKey("order_created", process.env);
  if (!key) throw new Error("API-ключ почты не настроен");
  const id = randomUUID(),
    db = createServerClient();
  const logged = await db.from("email_messages").insert({
    id,
    event_key: `studio-test:${id}`,
    kind: "order_created",
    recipient: "hello@roota.moscow",
    state: "sending",
    attempts: 1,
    claim: id,
    claimed_at: new Date().toISOString(),
    payload: { test: true, studio: true },
  });
  if (logged.error) throw new Error("Не удалось записать проверку в журнал");
  const message = studioEmailMessage(
    {
      order_number: "ПРОВЕРКА",
      total_amount: 100,
      status: "new",
      payment_status: "pending",
    },
    "created",
    id,
    { ...process.env, APP_ENV: "migration" },
  );
  const result = await sendUnisenderEmail(key, {
    ...message,
    metadata: { message_id: id },
  });
  const saved = await db
    .from("email_messages")
    .update({
      state: result.state === "rejected" ? "failed" : result.state,
      provider_job_id: result.state === "accepted" ? result.jobId : null,
      last_error:
        result.state === "unknown"
          ? "Проверьте доставку перед повтором"
          : result.state === "rejected"
            ? "Почтовый сервис отклонил письмо"
            : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("claim", id);
  if (saved.error) throw new Error("Проверьте журнал UniSender перед повтором");
  revalidatePath("/admin/messages");
}
export async function saveEmailSettings(form: FormData) {
  await requireAdmin();
  const values = z
    .object({
      review_delay_hours: z.coerce.number().int().min(1).max(720),
      reminder_delay_hours: z.coerce.number().int().min(1).max(168),
      test_recipients: z.array(z.string().email()).min(1).max(10),
    })
    .parse({
      review_delay_hours: form.get("review_delay_hours"),
      reminder_delay_hours: form.get("reminder_delay_hours"),
      test_recipients: String(form.get("test_recipients") ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    });
  const { error } = await createServerClient()
    .from("email_settings")
    .update({
      ...values,
      enabled: form.get("enabled") === "on",
      marketing_enabled: form.get("marketing_enabled") === "on",
      test_mode: form.get("test_mode") === "on",
    })
    .eq("id", 1);
  if (error) throw new Error("Не удалось сохранить настройки");
  revalidatePath("/admin/messages");
}
export async function saveEmailTemplate(form: FormData) {
  await requireAdmin();
  const kind = z.enum(templateKinds).parse(form.get("kind"));
  const subject = z
    .string()
    .min(1)
    .max(200)
    .refine((s) => !/[\r\n]/.test(s))
    .parse(form.get("subject"));
  const body = z.string().min(1).max(8000).parse(form.get("body"));
  const { error } = await createServerClient()
    .from("email_templates")
    .update({ subject, body, enabled: form.get("enabled") === "on" })
    .eq("kind", kind);
  if (error) throw new Error("Не удалось сохранить шаблон");
  revalidatePath("/admin/messages");
}
export async function testEmailTemplate(form: FormData) {
  await requireAdmin();
  const kind = z.enum(templateKinds).parse(form.get("kind"));
  const key = emailProviderKey(kind, process.env);
  if (!key) throw new Error("API-ключ не настроен");
  const { data: t, error } = await createServerClient()
    .from("email_templates")
    .select("subject,body")
    .eq("kind", kind)
    .single();
  if (error || !t) throw new Error("Шаблон недоступен");
  const db = createServerClient();
  const messageId = randomUUID();
  const { error: queueError } = await db.from("email_messages").insert({
    id: messageId,
    event_key: `test:${messageId}`,
    kind,
    recipient: "hello@roota.moscow",
    state: "sending",
    attempts: 1,
    claim: messageId,
    claimed_at: new Date().toISOString(),
    payload: { test: true },
  });
  if (queueError) throw new Error("Не удалось записать тест в журнал");
  const result = await sendUnisenderEmail(key, {
    to: "hello@roota.moscow",
    idempotenceKey: messageId,
    metadata: { message_id: messageId },
    ...renderEmail(
      t,
      {
        number: "GL-ТЕСТ",
        legal_version: LEGAL_VERSION,
        total: "3500",
        items: "Тарелочка × 1 — 3500 ₽",
        product: "Тарелочка",
        date: "14 октября 2026, 12:00 МСК",
        shipping: "350 ₽",
        payment: "Оплачено · пример",
        recipient: "Покупатель Roota",
        delivery: "Пункт выдачи Ozon",
        address: "Адрес выбранного пункта",
        tracking: "Появится после оформления отправления",
        delivery_subject: deliveryEmailUpdate(kind, "ПРИМЕР", []).subject,
        delivery_update: deliveryEmailUpdate(kind, "ПРИМЕР", []).message,
        tracking_hint: ozonTrackingHint(false),
        fulfillment:
          "Готовые изделия передаём в доставку в течение 1–3 рабочих дней после оплаты.",
        reservation: "Тестовый резерв",
        purpose: "тестовое уведомление",
      },
      siteUrl("/"),
      "Открыть Roota",
      undefined,
      kind.startsWith("order_"),
      [{ name: "Тарелочка", quantity: 1, price: 3150 }],
    ),
  });
  const { error: saveError } = await db
    .from("email_messages")
    .update({
      state: result.state === "rejected" ? "failed" : result.state,
      provider_job_id: result.state === "accepted" ? result.jobId : null,
      last_error:
        result.state === "accepted"
          ? null
          : "Проверьте статус теста в Unisender перед повтором",
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("state", "sending");
  if (saveError)
    throw new Error("Проверьте доставку теста в Unisender перед повтором");
  if (result.state !== "accepted")
    throw new Error("Проверьте статус в Unisender перед повтором");
  revalidatePath("/admin/messages");
}
export async function cancelEmailMessage(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const { error } = await createServerClient()
    .from("email_messages")
    .update({ state: "cancelled", last_error: "Остановлено студией" })
    .eq("id", id)
    .eq("state", "pending");
  if (error) throw new Error("Не удалось отменить письмо");
  revalidatePath("/admin/messages");
}
export async function moderateReview(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const state = z
    .enum(["published", "hidden", "pending"])
    .parse(form.get("state"));
  let query = createServerClient()
    .from("customer_reviews")
    .update({ state })
    .eq("id", id);
  if (state === "published") query = query.eq("publication_consent", true);
  const { error } = await query;
  if (error) throw new Error("Не удалось сохранить отзыв");
  revalidatePath("/admin/reviews");
  revalidatePath("/reviews");
}

export async function retryRejectedEmail(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const { error } = await createServerClient()
    .from("email_messages")
    .update({
      state: "pending",
      scheduled_at: new Date().toISOString(),
      claim: null,
      last_error: null,
    })
    .eq("id", id)
    .eq("state", "failed")
    .is("provider_job_id", null)
    .lt("attempts", 3);
  if (error) throw new Error("Не удалось повторить письмо");
  revalidatePath("/admin/messages");
}
