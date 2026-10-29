"use server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { revalidatePath } from "next/cache";
import { uuid } from "@/lib/validation";
export async function reviewReturnRequest(
  _previous: { error?: string; saved?: boolean },
  form: FormData,
): Promise<{ error?: string; saved?: boolean }> {
  await requireAdmin();
  const parsed = z
    .object({
      id: uuid,
      status: z.enum(["new", "reviewing", "agreed", "closed"]),
      reply: z.string().trim().max(4000),
    })
    .safeParse({
      id: form.get("id"),
      status: form.get("status"),
      reply: form.get("reply"),
    });
  if (!parsed.success)
    return { error: "Проверьте статус и текст ответа (до 4000 символов)." };
  try {
    const result = await getPool().query(
      `update customer_return_requests set status=$2,studio_reply=$3,updated_at=now() where id=$1 returning order_id`,
      [parsed.data.id, parsed.data.status, parsed.data.reply],
    );
    if (!result.rowCount) return { error: "Заявка не найдена." };
    revalidatePath("/admin/returns");
    revalidatePath(`/admin/orders/${result.rows[0].order_id}`);
    revalidatePath("/order/[token]", "page");
    return { saved: true };
  } catch {
    return { error: "Не удалось сохранить решение." };
  }
}
