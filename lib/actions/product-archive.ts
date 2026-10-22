"use server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import { uuid } from "@/lib/validation";
import { revalidatePath, revalidateTag } from "next/cache";

export async function setProductArchived(id: string, restore: boolean) {
  await requireAdmin();
  if (!uuid.safeParse(id).success || typeof restore !== "boolean")
    return { error: "Некорректный товар" };
  const db = createServerClient();
  let query = db
    .from("products")
    .update({
      publication_status: restore ? "draft" : "archived",
      featured: false,
    })
    .eq("id", id);
  query = restore
    ? query.eq("publication_status", "archived")
    : query.in("publication_status", ["draft", "published"]);
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data)
    return {
      error: "Не удалось изменить товар. Обновите страницу и попробуйте снова.",
    };
  revalidateTag("catalog", { expire: 0 });
  for (const path of [
    "/",
    "/catalog",
    "/admin/products",
    `/admin/products/${id}`,
    "/admin/site",
  ])
    revalidatePath(path);
  return { success: true };
}
