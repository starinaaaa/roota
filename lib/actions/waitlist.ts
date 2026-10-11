"use server";
import { createServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
import { z } from "zod";
export async function addToWaitlist(
  productId: string,
  contact: string,
): Promise<{ error?: string }> {
  if (!uuid.safeParse(productId).success || typeof contact !== "string")
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
    return {};
  } catch {
    return { error: "Не удалось связаться со студией" };
  }
}
