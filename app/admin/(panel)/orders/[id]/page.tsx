import { notFound } from "next/navigation";
import { getOrder } from "@/lib/admin-data";
import OrderEditor from "@/components/admin/OrderEditor";
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();
  return <OrderEditor order={order} />;
}
