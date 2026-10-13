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
    const { error: consentError } = await db.rpc("subscribe_restock", {
      p_email: value,
      p_product: productId,
      p_token: randomBytes(32).toString("hex"),
      p_version: "restock-direct-2026-10-14",
    });
    if (consentError)
      return {
        error: consentError.message.includes("RATE_LIMIT")
          ? "Слишком много заявок. Попробуйте позже."
          : "Не удалось сохранить подписку. Проверьте email или попробуйте позже.",
      };
    return {};
  } catch {
    return { error: "Не удалось связаться со студией" };
  }
}
