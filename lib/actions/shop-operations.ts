"use server";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { transaction } from "@/lib/db/pool";
export async function saveProductionTask(form: FormData) {
  const admin = await requireAdmin();
  const d = z
    .object({
      id: z.uuid(),
      stage: z.enum([
        "queued",
        "forming",
        "drying",
        "firing",
        "glazing",
        "ready",
      ]),
      ready_on: z.iso.date(),
      next_action: z.string().trim().max(500),
      reason: z.string().trim().min(3).max(500),
    })
    .parse(Object.fromEntries(form));
  await transaction(async (db) => {
    const {
      rows: [old],
    } = await db.query(
      `select t.*,i.order_id from public.production_tasks t join public.order_items i on i.id=t.order_item_id join public.orders o on o.id=i.order_id where t.id=$1 and o.payment_status='paid' and o.status not in ('cancelled','shipped','delivered') for update of t,o`,
      [d.id],
    );
    if (!old) throw new Error("Предзаказ больше не в работе");
    await db.query(
      "update public.production_tasks set stage=$2,ready_on=$3,next_action=$4,updated_at=now() where id=$1",
      [d.id, d.stage, d.ready_on, d.next_action],
    );
    await db.query(
      "insert into public.order_events(order_id,kind,old_value,new_value,reason,actor_id) values($1,'notes',$2,$3,$4,$5)",
      [
        old.order_id,
        `${old.stage} · ${old.ready_on}`,
        `${d.stage} · ${d.ready_on} · ${d.next_action}`,
        `Изготовление: ${d.reason}`,
        admin.id,
      ],
    );
  });
  revalidatePath("/admin/production");
  revalidatePath("/admin");
  revalidatePath("/order", "layout");
}
export async function saveCustomerNotes(form: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(form.get("id")),
    notes = z.string().max(5000).parse(form.get("notes"));
  await transaction(async (db) => {
    await db.query("update public.customers set notes=$2 where id=$1", [
      id,
      notes,
    ]);
  });
  revalidatePath(`/admin/customers/${id}`);
}
export async function adjustInventory(form: FormData) {
  const admin = await requireAdmin();
  const d = z
    .object({
      product_id: z.uuid(),
      delta: z.coerce
        .number()
        .int()
        .min(-100000)
        .max(100000)
        .refine((x) => x !== 0),
      kind: z.enum(["adjustment", "defect", "return", "manufactured"]),
      reason: z.string().trim().min(5).max(500),
    })
    .parse(Object.fromEntries(form));
  if (d.kind === "defect" && d.delta > 0)
    throw new Error("Брак уменьшает доступный остаток");
  if (["return", "manufactured"].includes(d.kind) && d.delta < 0)
    throw new Error("Возврат и изготовление увеличивают остаток");
  await transaction(async (db) => {
    await db.query(
      "select set_config('roota.inventory_kind',$1,true),set_config('roota.inventory_reason',$2,true),set_config('roota.inventory_actor',$3,true)",
      [d.kind, d.reason, admin.id],
    );
    const {
      rows: [p],
    } = await db.query(
      "select stock_qty,product_kind from public.products where id=$1 for update",
      [d.product_id],
    );
    if (!p || p.stock_qty + d.delta < 0)
      throw new Error("Недостаточно свободных изделий");
    const {
      rows: [reserved],
    } = await db.query(
      "select coalesce(sum(i.quantity),0)::int n from public.order_items i join public.orders o on o.id=i.order_id where i.product_id=$1 and i.purchase_mode='stock' and o.reservation_state='active'",
      [d.product_id],
    );
    if (p.product_kind === "unique" && p.stock_qty + d.delta + reserved.n > 1)
      throw new Error(
        "Единственный экземпляр уже есть на складе или в резерве",
      );
    await db.query(
      "update public.products set stock_qty=stock_qty+$2 where id=$1",
      [d.product_id, d.delta],
    );
  });
  revalidateTag("catalog", { expire: 0 });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
}
