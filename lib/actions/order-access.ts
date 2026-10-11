"use server";
import { requireAdmin } from "@/lib/auth";
import { ensureOrderLink } from "@/lib/order-access";
import { uuid } from "@/lib/validation";
export async function prepareOrderLink(id: unknown, rotate = false) {
  await requireAdmin();
  if (!uuid.safeParse(id).success) return { error: "Неверный заказ" };
  try {
    return { url: await ensureOrderLink(id as string, rotate === true) };
  } catch {
    return { error: "Не удалось подготовить ссылку" };
  }
}
