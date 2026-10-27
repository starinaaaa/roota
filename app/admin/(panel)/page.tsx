import Link from "next/link";
import { attentionItems } from "@/lib/shop-operations";
export default async function AdminPage() {
  const items = await attentionItems();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-section">Требует внимания</h1>
      <p>{items.length ? `Задач: ${items.length}` : "Срочных задач нет"}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item, i) => (
          <Link
            key={`${item.id}:${i}`}
            href={item.href}
            className="border border-stone-300 rounded-lg p-5 hover:bg-stone-100"
          >
            <p className="font-medium">{item.title}</p>
            <p className="mt-2 text-sm break-words">{item.detail}</p>
          </Link>
        ))}
      </div>
      <Link className="admin-secondary" href="/admin/orders">
        Все заказы
      </Link>
    </div>
  );
}
