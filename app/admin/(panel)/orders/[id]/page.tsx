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
  return (
    <div className="space-y-6">
      <OrderEditor order={order} />
      <OrderCustomerHistory
        orderId={order.id}
        customerId={order.customer_id}
        total={order.total_amount}
      />
    </div>
  );
}
