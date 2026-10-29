import { orderCarrierReturns } from "@/lib/delivery/returns-data";
import CarrierReturns from "@/components/admin/CarrierReturns";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder } from "@/lib/admin-data";
import OrderCustomerHistory from "@/components/admin/OrderCustomerHistory";
import OrderEditor from "@/components/admin/OrderEditor";
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();
  const returns = await orderCarrierReturns(id);
  return (
    <div className="space-y-6">
      <OrderEditor order={order} />
      <section className="admin-card space-y-3">
        <h2 className="text-lg">Возвраты</h2>
        <Link href="/admin/returns" className="underline">Заявки покупателей и контроль возвратных отправлений</Link>
        <CarrierReturns returns={returns} />
      </section>
      <OrderCustomerHistory
        orderId={order.id}
        customerId={order.customer_id}
        total={order.total_amount}
      />
    </div>
  );
}
