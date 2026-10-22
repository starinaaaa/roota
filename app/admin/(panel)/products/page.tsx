import Link from "next/link";
import { listAdminProducts } from "@/lib/admin-data";
import { publicationLabels } from "@/lib/validation";
import { formatPrice } from "@/lib/format-price";
import ProductArchiveButton from "@/components/admin/ProductArchiveButton";
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ archive?: string }>;
}) {
  const products = await listAdminProducts();
  const archived = (await searchParams).archive === "1";
  const visible = products.filter(
    (p) => (p.publication_status === "archived") === archived,
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-4">
        <h2 className="text-xl">
          {archived ? "Архив" : "Товары"} · {visible.length}
        </h2>
        <Link className="admin-button" href="/admin/products/new">
          Добавить изделие
        </Link>
      </div>
      <nav aria-label="Список товаров" className="flex gap-5">
        <Link
          href="/admin/products"
          className="underline underline-offset-4"
          aria-current={!archived ? "page" : undefined}
        >
          Товары
        </Link>
        <Link
          href="/admin/products?archive=1"
          className="underline underline-offset-4"
          aria-current={archived ? "page" : undefined}
        >
          Архив (
          {products.filter((p) => p.publication_status === "archived").length})
        </Link>
      </nav>
      <p className="text-sm text-stone-600">
        Удалённые товары хранятся в архиве. Восстановленный товар появится в
        черновиках; история заказов сохраняется.
      </p>
      {!visible.length && (
        <p className="admin-card">
          {archived ? "В архиве пока нет товаров." : "Товаров пока нет."}
        </p>
      )}
      {visible.map((p) => (
        <article
          key={p.id}
          className="admin-card flex flex-wrap items-center gap-4"
        >
          <Link
            href={`/admin/products/${p.id}`}
            className="grid flex-1 min-w-60 md:grid-cols-[2fr_1fr_1fr_1fr] gap-3 hover:underline"
          >
            <div>
              <strong>{p.name}</strong>
              <p className="text-sm text-stone-600">
                {p.product_kind === "unique"
                  ? "Единственный экземпляр"
                  : "Партия"}
              </p>
            </div>
            <p>{formatPrice(p.price)}</p>
            <p>Доступно: {p.stock_qty}</p>
            <p>
              {publicationLabels[p.publication_status]}
              {p.preorder_enabled ? " · Предзаказ" : ""}
            </p>
          </Link>
          <ProductArchiveButton id={p.id} name={p.name} archived={archived} />
        </article>
      ))}
    </div>
  );
}
