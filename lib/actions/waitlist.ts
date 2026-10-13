"use server";
import { createServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
export async function addToWaitlist(
  productId: string,
  contact: string,
  consent: boolean,
): Promise<{ error?: string }> {
  if (
    !uuid.safeParse(productId).success ||
    typeof contact !== "string" ||
    consent !== true
  )
    return { error: "Проверьте данные" };
  const email = z.string().trim().email().max(254).safeParse(contact);
  if (!email.success) return { error: "Укажите корректный email" };
  const value = email.data.toLowerCase();
  try {
    const db = createServerClient();
    const { data } = await db
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("publication_status", "published")
      .maybeSingle();
    if (!data) return { error: "Изделие недоступно" };
    const { error } = await db
      .from("waitlist")
      .upsert(
        { product_id: productId, contact: value },
        { onConflict: "product_id,contact", ignoreDuplicates: true },
      );
    if (error) return { error: "Не удалось сохранить заявку" };
    const { error: consentError } = await db.rpc("request_email_subscription", {
      p_email: value,
      p_purpose: "restock",
      p_resource: productId,
      p_token: randomBytes(32).toString("hex"),
      p_version: "restock-2026-10-14",
    });
    if (consentError)
      return { error: "Не удалось отправить подтверждение. Попробуйте позже." };
    return {};
  } catch {
    return { error: "Не удалось связаться со студией" };
  }
}
