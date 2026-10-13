"use server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { renderEmail, templateKinds } from "@/lib/email/templates";
import { sendUnisenderEmail } from "@/lib/email/unisender-transport";
import { randomUUID } from "node:crypto";
import { siteUrl } from "@/lib/seo";
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
  const key = process.env.UNISENDER_GO_API_KEY;
  if (!key) throw new Error("API-ключ не настроен");
  const { data: t, error } = await createServerClient()
    .from("email_templates")
    .select("subject,body")
    .eq("kind", kind)
    .single();
  if (error || !t) throw new Error("Шаблон недоступен");
  const result = await sendUnisenderEmail(key, {
    to: "hello@roota.moscow",
    idempotenceKey: `test-${randomUUID()}`,
    ...renderEmail(
      t,
      {
        number: "ТЕСТ",
        total: "3500",
        items: "Тарелочка × 1 — 3500 ₽",
        product: "Тарелочка",
        reservation: "Тестовый резерв",
        purpose: "тестовое уведомление",
      },
      siteUrl("/"),
      "Открыть Roota",
    ),
  });
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
