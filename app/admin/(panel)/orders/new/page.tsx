import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { uuid } from "@/lib/validation";
import ManualOrderEditor from "@/components/admin/ManualOrderEditor";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ repeat?: string }>;
}) {
  await requireAdmin();
  const { repeat } = await searchParams;
  const db = getPool();
  const { rows: products } = await db.query(
    "select id,name,price,stock_qty,preorder_enabled,lead_time_days,configurator from public.products where publication_status='published' order by name",
  );
  let initial;
  if (uuid.safeParse(repeat).success) {
    const {
      rows: [o],
    } = await db.query(
      "select customer_name,customer_email email,customer_phone phone from public.orders where id=$1",
      [repeat],
    );
    const { rows: items } = await db.query(
      "select i.product_id,coalesce(p.name,i.product_name) name,coalesce(case when i.configuration is not null then public.garden_price(i.configuration) else p.price end,i.price) price,i.quantity,case when i.configuration is not null or p.stock_qty<i.quantity or p.id is null then 'preorder' else i.purchase_mode end mode,coalesce(p.lead_time_days,i.lead_time_days,21) lead_days,i.configuration from public.order_items i left join public.products p on p.id=i.product_id where order_id=$1",
      [repeat],
    );
    if (o) initial = { ...o, items };
  }
  return (
    <div className="space-y-6">
      <h1 className="font-display text-section">Создать заказ вручную</h1>
      <p>
        Соберите условия после переписки. Покупатель проверит состав, подтвердит
        контакты и условия, затем перейдёт к оплате.
      </p>
      <ManualOrderEditor products={products} initial={initial} />
    </div>
  );
}
