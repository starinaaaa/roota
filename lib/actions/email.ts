"use server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
import { getCart } from "./cart";
export async function requestCartEmail(email: string, consent: boolean) {
  const parsed = z.string().trim().email().max(254).safeParse(email);
  const session = (await cookies()).get("cart_session")?.value;
  if (!parsed.success || consent !== true || !uuid.safeParse(session).success)
    return { error: "Укажите email и подтвердите согласие на напоминание" };
  const { items } = await getCart();
  if (!items.length || items.some((i) => i.purchase_mode === "preorder"))
    return { error: "Ссылка доступна для корзины с изделиями в наличии" };
  const { error } = await createServerClient().rpc(
    "request_email_subscription",
    {
      p_email: parsed.data.toLowerCase(),
      p_purpose: "cart",
      p_resource: session,
      p_token: randomBytes(32).toString("hex"),
      p_version: "cart-reminder-2026-10-14",
      p_items: items.map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        name: i.product.name,
      })),
    },
  );
  return error
    ? { error: "Не удалось сохранить корзину. Попробуйте позже." }
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
