import Link from "next/link";
import { listAdminProducts } from "@/lib/admin-data";
import { publicationLabels } from "@/lib/validation";
import { formatPrice } from "@/lib/products";
export default async function ProductsPage() {
  const products = await listAdminProducts();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-4">
        <h2 className="text-xl">Товары · {products.length}</h2>
        <Link className="admin-button" href="/admin/products/new">
          Добавить изделие
        </Link>
      </div>
      {products.map((p) => (
        <Link
          key={p.id}
          href={`/admin/products/${p.id}`}
          className="admin-card grid md:grid-cols-[2fr_1fr_1fr_1fr] gap-3 hover:border-stone-500"
        >
          <strong>{p.name}</strong>
          <p>{formatPrice(p.price)}</p>
          <p>Доступно: {p.stock_qty}</p>
          <p>
            {publicationLabels[p.publication_status]}
            {p.preorder_enabled ? " · Предзаказ" : ""}
          </p>
        </Link>
      ))}
    </div>
  );
}
