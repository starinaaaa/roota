"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import type { Category } from "@/types";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Укажите название категории").max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Укажите адрес категории")
    .max(120)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "В адресе допустимы латинские буквы, цифры и дефисы",
    ),
});

export async function createCategory(
  input: unknown,
): Promise<
  { category: Category; error?: never } | { error: string; category?: never }
> {
  await requireAdmin();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let category: Category;
  try {
    const result = await getPool().query<Category>(
      "insert into categories(name,slug) values($1,$2) returning id,name,slug,sort_order",
      [parsed.data.name, parsed.data.slug],
    );
    category = result.rows[0];
  } catch (error) {
    return {
      error:
        (error as { code?: string }).code === "23505"
          ? "Этот адрес категории уже занят. Выберите другой."
          : "Не удалось добавить категорию. Попробуйте ещё раз.",
    };
  }
  revalidateTag("catalog", { expire: 0 });
  revalidatePath("/admin/products");
  return { category };
}
