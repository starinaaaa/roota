"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient } from "@/lib/db";
import { transaction } from "@/lib/db/pool";
import { gardenConfigurationSchema } from "@/lib/garden";
import { getCart } from "./cart";
import { uuid } from "@/lib/validation";
import { recordFunnelEvent } from "@/lib/analytics/server";
import type { CartItem } from "@/types";

export async function saveGarden(
  input: unknown,
): Promise<{ error?: string; items?: CartItem[] }> {
  const parsed = z
    .strictObject({
      productId: uuid,
      lineId: uuid,
      operation: z.enum(["add", "set", "remove"]),
      configuration: gardenConfigurationSchema.nullable(),
    })
    .safeParse(input);
  const session = (await cookies()).get("cart_session")?.value;
  if (
    !parsed.success ||
    !uuid.safeParse(session).success ||
    (parsed.data.operation !== "remove" && !parsed.data.configuration)
  )
    return { error: "Проверьте состав сада и обновите страницу." };
  try {
    const { error } = await createServerClient().rpc("mutate_garden_cart", {
      p_session: session,
      p_product: parsed.data.productId,
      p_configuration: parsed.data.configuration,
      p_line: parsed.data.lineId,
      p_operation: parsed.data.operation,
    });
    if (error)
      return {
        error:
          error.message === "CART_LIMIT"
            ? "В корзине уже 50 позиций. Оформите этот заказ перед сборкой новых садов."
            : error.message === "INVALID_GARDEN"
              ? "Заполните выбранный размер сада."
              : "Не удалось сохранить сад. Обновите страницу и попробуйте ещё раз.",
      };
    if (parsed.data.operation === "add")
      await recordFunnelEvent("add_to_cart", parsed.data.productId);
    revalidatePath("/checkout");
    return { items: (await getCart()).items };
  } catch {
    return { error: "Не удалось связаться со студией. Попробуйте ещё раз." };
  }
}

export async function requestGarden(
  input: unknown,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = z
    .strictObject({
      name: z.string().trim().min(1).max(100),
      contact: z.string().trim().min(3).max(254),
      wishes: z.string().trim().max(2000),
      configuration: gardenConfigurationSchema,
      consent: z.literal(true),
      website: z.literal(""),
    })
    .safeParse(input);
  const session = (await cookies()).get("cart_session")?.value;
  if (!parsed.success || !uuid.safeParse(session).success)
    return { error: "Укажите имя, контакт и согласие на обработку данных." };
  try {
    await transaction(async (db) => {
      await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        session,
      ]);
      const { rows } = await db.query<{ n: number }>(
        "select count(*)::int n from garden_requests where cart_session=$1 and created_at>now()-interval '1 hour'",
        [session],
      );
      if (rows[0].n >= 3) throw new Error("RATE_LIMIT");
      await db.query(
        `insert into garden_requests(cart_session,name,contact,wishes,configuration,consent_version)
        values($1,$2,$3,$4,$5::jsonb,'garden-request-2026-10-25')`,
        [
          session,
          parsed.data.name,
          parsed.data.contact,
          parsed.data.wishes,
          JSON.stringify(parsed.data.configuration),
        ],
      );
    });
    return { success: true };
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message === "RATE_LIMIT"
          ? "Заявка уже сохранена. Даша свяжется с вами; повторить можно через час."
          : "Не удалось сохранить заявку. Попробуйте ещё раз или напишите в Telegram.",
    };
  }
}
