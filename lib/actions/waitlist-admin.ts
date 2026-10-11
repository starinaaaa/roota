"use server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
import { revalidatePath } from "next/cache";

export async function markWaitlistNotified(form: FormData) {
  await requireAdmin();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) throw new Error("Некорректная заявка");
  const { error } = await createServerClient()
    .from("waitlist")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id.data)
    .is("notified_at", null);
  if (error) throw new Error("Не удалось обновить заявку");
  revalidatePath("/admin/waitlist");
}
