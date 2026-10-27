"use server";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { attentionItems } from "@/lib/shop-operations";
import { isPrivateReview } from "@/lib/review-schema";
import { revalidatePath } from "next/cache";
export async function resolveAttention(key: string, resolved: boolean) {
  await requireAdmin();
  if (isPrivateReview())
    throw new Error("На стенде отметки сохраняются только в браузере");
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Некорректная задача");
  if (resolved && !(await attentionItems()).some((item) => item.key === key))
    throw new Error("Задача уже изменилась. Обновите страницу");
  if (resolved)
    await getPool().query(
      "insert into public.admin_attention_resolutions (task_key) values ($1) on conflict (task_key) do update set resolved_at=now()",
      [key],
    );
  else
    await getPool().query(
      "delete from public.admin_attention_resolutions where task_key=$1",
      [key],
    );
  revalidatePath("/admin");
}
