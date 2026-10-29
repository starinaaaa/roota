"use server";

import { cookies } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { phone, uuid } from "@/lib/validation";
import { processEmailQueue } from "@/lib/email/queue";

export async function checkReviewPromo(code: string, customerPhone: string) {
  const parsed = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^ROOTA-[A-F0-9]{12}$/)
    .safeParse(code);
  const normalized = phone.safeParse(customerPhone);
  if (!parsed.success || !normalized.success)
    return {
      error: "Проверьте промокод и укажите телефон из предыдущего заказа.",
    };
  const session = (await cookies()).get("cart_session")?.value;
  if (!uuid.safeParse(session).success)
    return { error: "Обновите страницу, чтобы восстановить корзину." };
  const { rows } = await getPool().query<{
    code: string;
    discount: string;
    expires_at: Date;
  }>(
    `
    select r.code,round(sum(public.cart_item_price(p,ci.configuration)*ci.quantity)*r.percent/100,2) as discount,r.expires_at
    from public.review_rewards r cross join public.carts c
    join public.cart_items ci on ci.cart_id=c.id join public.products p on p.id=ci.product_id
    where r.code=$1 and r.phone=$2 and r.revoked_at is null and r.expires_at>now()
      and r.redeemed_at is null and r.reserved_order_id is null and c.session_id=$3
    group by r.id having sum(public.cart_item_price(p,ci.configuration)*ci.quantity)>0`,
    [parsed.data, normalized.data, session],
  );
  if (!rows[0])
    return {
      error:
        "Промокод недоступен. Проверьте код, срок действия и телефон из предыдущего заказа. Возможно, код уже применён к другому заказу.",
    };
  return {
    code: rows[0].code,
    discount: Number(rows[0].discount),
    expiresAt: rows[0].expires_at.toISOString(),
  };
}

export async function confirmTelegramReview(form: FormData) {
  await requireAdmin();
  const order = uuid.parse(form.get("order_id"));
  if (form.get("confirmed") !== "on")
    throw new Error("Подтвердите, что получили отзыв в Telegram.");
  await getPool().query("select public.issue_review_reward($1,'telegram')", [
    order,
  ]);
  after(async () => {
    try {
      await processEmailQueue();
    } catch {
      console.error("review_reward_queue_failed");
    }
  });
  revalidatePath("/admin/reviews");
  revalidatePath(`/admin/orders/${order}`);
}
