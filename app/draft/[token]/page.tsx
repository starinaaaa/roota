import { reviewQuery } from "@/lib/review-schema";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/format-price";
import { gardenSummary } from "@/lib/garden";
import type { ManualItem } from "@/lib/manual-orders";
import ManualConfirmation from "@/components/checkout/ManualConfirmation";
import { ensureOrderLink } from "@/lib/order-access";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Подтверждение заказа — Roota",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer" as const,
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const {
    rows: [d],
  } = await reviewQuery("manual_order_drafts",
    "select * from public.manual_order_drafts where token=$1",
    [token],
  );
  if (!d) notFound();
  if (d.order_id)
    return (
      <main className="px-6 pt-28 pb-20 max-w-3xl mx-auto">
        <h1 className="font-display text-section">Заказ подтверждён</h1>
        <Link href={await ensureOrderLink(d.order_id)} className="underline">
          Открыть заказ и оплату
        </Link>
      </main>
    );
  if (d.expires_at < new Date())
    return (
      <main className="px-6 pt-28 pb-20">
        <h1>Срок предложения истёк</h1>
        <p>
          Свяжитесь со студией, чтобы уточнить наличие и получить новую ссылку.
        </p>
      </main>
    );
  const items = d.items as ManualItem[],
    total = items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      d.delivery_amount,
    );
  return (
    <main className="px-6 md:px-12 pt-28 pb-20 max-w-3xl mx-auto space-y-7">
      <h1 className="font-display text-page">Ваш заказ от студии</h1>
      <p>Проверьте изделия, суммы и получение перед оплатой.</p>
      {items.map((i, n) => (
        <article key={n} className="border-b py-4">
          <h2>
            {i.name} × {i.quantity}
          </h2>
          <p>{formatPrice(i.price * i.quantity)}</p>
          {i.configuration && <p>{gardenSummary(i.configuration)}</p>}
          {i.mode === "preorder" && (
            <p>Изготовление: до {i.lead_days} дней после оплаты</p>
          )}
        </article>
      ))}
      <p>
        Получение:{" "}
        {
          {
            pickup: "Самовывоз по согласованию",
            yandex_courier: "Яндекс Курьер; оплачивается отдельно",
            agreed: "По согласованию со студией",
          }[d.delivery_method as string]
        }{" "}
        · {d.delivery_address}
      </p>
      <p>Доставка в сумме заказа: {formatPrice(d.delivery_amount)}</p>
      <p className="text-2xl">Итого: {formatPrice(total)}</p>
      {d.comment && <p className="whitespace-pre-wrap">{d.comment}</p>}
      <p>
        Ссылка до{" "}
        {d.expires_at.toLocaleDateString("ru-RU", {
          timeZone: "Europe/Moscow",
        })}
        . Весь заказ отправится после готовности всех изделий.
      </p>
      <ManualConfirmation
        token={token}
        name={d.customer_name}
        email={d.email}
        phone={d.phone}
        courier={d.delivery_method === "yandex_courier"}
      />
    </main>
  );
}
