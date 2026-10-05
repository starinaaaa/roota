"use server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { siteSchema } from "@/lib/site-schema";
import { revalidatePath } from "next/cache";
export async function saveSite(input: unknown, publish = false) {
  await requireAdmin();
  const parsed = siteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = createServerClient(),
    payload = parsed.data;
  if (publish && payload.featuredIds.length) {
    const { data, error } = await db
      .from("products")
      .select("id")
      .in("id", payload.featuredIds)
      .eq("publication_status", "published");
    if (error || data?.length !== payload.featuredIds.length)
      return {
        error: "В избранном есть неопубликованные или недоступные изделия",
      };
  }
  const { error } = publish
    ? await db.rpc("publish_site", { p_payload: payload })
    : await db
        .from("site_drafts")
        .upsert({ id: 1, payload, updated_at: new Date().toISOString() });
  if (error) return { error: "Не удалось сохранить содержимое" };
  for (const path of ["/", "/about", "/contacts", "/delivery", "/admin/site"])
    revalidatePath(path);
  return { success: true };
}
