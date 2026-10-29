import { returnAttentionItems } from "@/lib/delivery/returns-data";
import { createHash } from "node:crypto";
import AttentionBoard from "@/components/admin/AttentionBoard";
import { isPrivateReview, reviewQuery } from "@/lib/review-schema";
import Link from "next/link";
import { attentionItems } from "@/lib/shop-operations";
export default async function AdminPage() {
  const [operations, returns] = await Promise.all([attentionItems(), returnAttentionItems()]);
  const items = [...returns.map(item => ({
    ...item,
    key: createHash("sha256").update(JSON.stringify(["return", item.id, item.title, item.detail])).digest("hex"),
  })), ...operations];
  const resolved = (
    await reviewQuery(
      "admin_attention_resolutions",
      "select task_key from public.admin_attention_resolutions",
    )
  ).rows.map((row) => row.task_key as string);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-section">Требует внимания</h1>
      <AttentionBoard
        items={items}
        initialResolved={resolved}
        reviewOnly={isPrivateReview()}
      />
      <Link className="admin-secondary" href="/admin/orders">
        Все заказы
      </Link>
    </div>
  );
}
