import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import { formatPrice } from "@/lib/format-price";
import { orderLabels, paymentLabels } from "@/lib/validation";
import ReturnEditor, { type ReturnData } from "./ReturnEditor";

export default async function OrderCustomerHistory({
  orderId,
  customerId,
  total,
}: {
  orderId: string;
  customerId: string | null;
  total: number;
}) {
  await requireAdmin();
  const db = createServerClient();
  const [returns, payment, history] = await Promise.all([
    db
      .from("order_returns")
      .select("money_state,goods_state,notes,amount,provider_request_id")
      .eq("order_id", orderId)
      .maybeSingle(),
    db
      .from("payments")
      .select("id,status")
      .eq("order_id", orderId)
      .eq("mode", "live")
      .maybeSingle(),
    customerId
      ? db
          .from("orders")
          .select(
            "id,order_number,created_at,total_amount,status,payment_status,internal_notes",
          )
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (returns.error || payment.error || history.error)
    throw new Error("Не удалось загрузить возврат и историю покупателя");
  const orders = history.data ?? [];
  const paid = orders.filter((o) => o.payment_status === "paid");
  return (
    <div className="space-y-6">
      <ReturnEditor
        orderId={orderId}
        total={formatPrice(total)}
        value={returns.data as ReturnData | null}
        canRefund={payment.data?.status === "paid"}
        configured={Boolean(process.env.ROBOKASSA_PASSWORD3)}
      />
      <section className="admin-card space-y-3">
        <h3 className="text-lg">История покупателя</h3>
        <p>
          {paid.length} оплаченных заказов ·{" "}
          {formatPrice(
            paid.reduce((sum, o) => sum + Number(o.total_amount), 0),
          )}
          {paid.length > 1 ? " · Повторная покупка" : ""}
        </p>
        <p className="text-sm text-stone-600">
          Последние 50 заказов по карточке покупателя. Возвращённые платежи не
          входят в оплаченную сумму.
        </p>
        {orders.map((o) => (
          <div key={o.id} className="border-b border-stone-100 pb-3">
            <Link href={`/admin/orders/${o.id}`} className="underline">
              {o.order_number}
            </Link>
            {o.id === orderId ? " · Этот заказ" : ""}
            <p className="text-sm">
              {new Date(o.created_at).toLocaleDateString("ru-RU", {
                timeZone: "Europe/Moscow",
              })}{" "}
              · {formatPrice(o.total_amount)} ·{" "}
              {orderLabels[o.status] ?? o.status} ·{" "}
              {paymentLabels[o.payment_status] ?? o.payment_status}
            </p>
            {o.internal_notes && (
              <p className="text-sm whitespace-pre-wrap">
                Заметки: {o.internal_notes}
              </p>
            )}
          </div>
        ))}
        {!customerId && (
          <p>У этого заказа нет связанной карточки покупателя.</p>
        )}
      </section>
    </div>
  );
}
