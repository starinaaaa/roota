import "server-only";
import { cookies } from "next/headers";
import { getCart } from "@/lib/actions/cart";
import { createServerClient } from "@/lib/supabase/server";
import { phone, uuid } from "@/lib/validation";
import {
  cartSnapshot,
  pointInCity,
  packingFor,
  type DeliveryContext,
  type DeliveryPoint,
  type DeliveryQuote,
  type PackingRule,
} from "./model";
import { ozon, ozonConfigured, shipmentMethodId, pointInfo } from "./ozon";
export async function deliverySession() {
  const session = (await cookies()).get("cart_session")?.value;
  if (!uuid.safeParse(session).success)
    throw new Error("Обновите страницу, чтобы восстановить корзину.");
  return session!;
}
export async function deliveryContext(
  rawPhone: unknown,
): Promise<DeliveryContext> {
  const parsed = phone.safeParse(rawPhone);
  if (!parsed.success)
    throw new Error("Укажите российский телефон: +7 и 10 цифр.");
  if (!ozonConfigured())
    throw new Error("Доставка временно недоступна. Свяжитесь со студией.");
  const { items: cart } = await getCart();
  if (!cart.length) throw new Error("Корзина пуста.");
  const { data: rules, error } = await createServerClient()
    .from("delivery_packing_rules")
    .select("*")
    .eq("active", true);
  if (error)
    throw new Error("Не удалось проверить упаковку заказа. Повторите позже.");
  const items = cartSnapshot(
    cart.map((i) => ({
      product_id: i.product_id,
      category_id: i.product.category_id,
      quantity: i.quantity,
      price: i.product.price,
      purchase_mode: i.purchase_mode ?? "stock",
    })),
  );
  const packing = packingFor(items, rules as PackingRule[]);
  const days = Number(process.env.OZON_HANDLING_DAYS);
  const productionDays = Math.max(
    0,
    ...cart.map((i) =>
      i.purchase_mode === "preorder" ? (i.product.lead_time_days ?? 0) : 0,
    ),
  );
  const cutoffAt =
    Number.isInteger(days) && days >= 0 && process.env.OZON_HANDLING_DAYS
      ? new Date(Date.now() + (days + productionDays) * 86400000).toISOString()
      : undefined;
  const context = {
    phone: parsed.data,
    items,
    packing,
    shipmentMethodId: await shipmentMethodId(),
    cutoffAt,
  };
  return context;
}
export function publicPoint(
  info: Awaited<ReturnType<typeof pointInfo>>[number],
): DeliveryPoint {
  return {
    id: info.delivery_point_id,
    name: info.name,
    address: info.full_address,
  };
}
export async function quoteDelivery(
  rawPhone: unknown,
  city: string,
  pointId: number,
  existingId?: string,
): Promise<DeliveryQuote> {
  const session = await deliverySession(),
    context = await deliveryContext(rawPhone);
  if (existingId) {
    const { data: old, error } = await createServerClient()
      .from("delivery_quotes")
      .select("cart_snapshot,packing_rule_id,packing_updated_at")
      .eq("id", existingId)
      .eq("cart_session", session)
      .single();
    if (error || !old)
      throw new Error("Расчёт доставки устарел. Рассчитайте доставку ещё раз.");
    if (
      JSON.stringify(cartSnapshot(old.cart_snapshot)) !==
      JSON.stringify(context.items)
    )
      throw new Error(
        "Корзина изменилась. Обновите страницу и пересчитайте доставку.",
      );
    if (
      old.packing_rule_id !== context.packing.id ||
      Date.parse(old.packing_updated_at) !==
        Date.parse(context.packing.updated_at)
    )
      throw new Error("Упаковка изменилась. Рассчитайте доставку ещё раз.");
  }
  await ozon.checkRecipient(context.phone);
  const info = (await pointInfo([pointId])).find(
    (p) => p.delivery_point_id === pointId,
  );
  if (
    !info?.is_active ||
    info.type !== "pvz" ||
    !pointInCity(info.full_address, city)
  )
    throw new Error("Выберите доступный пункт в указанном городе.");
  const cost = await ozon.quote(pointId, context);
  const point = publicPoint(info),
    id = existingId ?? crypto.randomUUID(),
    expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
  const totalCost =
    Math.round((cost.deliveryCost + cost.insuranceCost) * 100) / 100;
  const row = {
    id,
    cart_session: session,
    phone: context.phone,
    city: city.trim(),
    point,
    packing_rule_id: context.packing.id,
    packing_updated_at: context.packing.updated_at,
    packing: context.packing,
    cart_snapshot: context.items,
    shipment_method_id: context.shipmentMethodId,
    cutoff_at: context.cutoffAt ?? null,
    goods_amount: context.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    ),
    delivery_amount: cost.deliveryCost,
    insurance_amount: cost.insuranceCost,
    estimated_days: cost.estimatedDays,
    expires_at: expiresAt,
    checked_at: new Date().toISOString(),
  };
  const db = createServerClient();
  const result = existingId
    ? await db
        .from("delivery_quotes")
        .update(row)
        .eq("id", id)
        .eq("cart_session", session)
        .select("id")
        .single()
    : await db.from("delivery_quotes").insert(row).select("id").single();
  if (result.error)
    throw new Error("Не удалось сохранить расчёт доставки. Повторите попытку.");
  return { id, ...cost, totalCost, expiresAt, point };
}
