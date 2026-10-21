"use server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/db";
import { uuid } from "@/lib/validation";
import { getCart } from "./cart";
import { EMAIL_CONSENT_VERSION } from "@/lib/legal";
export async function syncCheckoutEmailConsent(
  email: string,
  choices: { dataConsent: boolean; marketingConsent: boolean },
) {
  const session = (await cookies()).get("cart_session")?.value;
  const parsedChoices = z
    .object({ dataConsent: z.boolean(), marketingConsent: z.boolean() })
    .safeParse(choices);
  if (!parsedChoices.success || !uuid.safeParse(session).success)
    return { error: "Обновите страницу и попробуйте снова." };
  const consent =
    parsedChoices.data.dataConsent && parsedChoices.data.marketingConsent;
  const parsed = z.string().trim().email().max(254).safeParse(email);
  if (consent && !parsed.success) return { error: "Укажите корректный email." };
  const items = consent ? (await getCart()).items : [];
  const { error } = await createServerClient().rpc(
    "sync_checkout_email_consent",
    {
      p_session: session,
      p_email: parsed.success ? parsed.data.toLowerCase() : "",
      p_enabled: consent,
      p_cart_token: randomBytes(32).toString("hex"),
      p_news_token: randomBytes(32).toString("hex"),
      p_version: EMAIL_CONSENT_VERSION,
      p_items: items
        .filter((i) => i.purchase_mode !== "preorder")
        .map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          name: i.product.name,
        })),
    },
  );
  return error
    ? { error: "Не удалось сохранить согласие. Попробуйте ещё раз." }
    : {};
}
export async function confirmEmail(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Неверная ссылка");
  const { data, error } = await createServerClient().rpc(
    "confirm_email_subscription",
    { p_token: token },
  );
  if (error || !data)
    throw new Error("Ссылка истекла. Запросите новое письмо.");
  redirect(`/email/${token}?confirmed=1`);
}
export async function unsubscribeEmail(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Неверная ссылка");
  const { error } = await createServerClient().rpc(
    "revoke_email_subscription",
    { p_token: token, p_all: form.get("all") === "on" },
  );
  if (error) throw new Error("Не удалось сохранить настройки");
  redirect(`/email/${token}?unsubscribed=1`);
}
export async function restoreCartEmail(form: FormData) {
  const token = String(form.get("token") ?? ""),
    session = (await cookies()).get("cart_session")?.value;
  if (!/^[a-f0-9]{64}$/.test(token) || !uuid.safeParse(session).success)
    throw new Error("Обновите страницу");
  const { error } = await createServerClient().rpc("restore_email_cart", {
    p_token: token,
    p_session: session,
    p_replace: form.get("replace") === "on",
  });
  if (error)
    redirect(
      `/cart/restore/${token}?error=${error.message === "CART_NOT_EMPTY" ? "occupied" : "unavailable"}`,
    );
  redirect("/checkout");
}

export async function touchCheckoutEmail() {
  const session = (await cookies()).get("cart_session")?.value;
  if (!uuid.safeParse(session).success) return;
  const db = createServerClient();
  const { data: d } = await db
    .from("checkout_drafts")
    .select("id")
    .eq("session_id", session)
    .is("completed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!d) return;
  const { items } = await getCart();
  await db
    .from("checkout_drafts")
    .update({
      last_activity_at: new Date().toISOString(),
      items: items
        .filter((i) => i.purchase_mode === "stock")
        .map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          name: i.product.name,
        })),
    })
    .eq("id", d.id);
}
