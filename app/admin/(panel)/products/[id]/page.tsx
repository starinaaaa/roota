import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getAdminProduct } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { getCategories } from "@/lib/products";
import ProductEditor from "@/components/admin/ProductEditor";
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const product = id === "new" ? null : await getAdminProduct(id);
  if (id !== "new" && !product) notFound();
  const categories = await getCategories();
  return (
    <ProductEditor
      id={product?.id ?? randomUUID()}
      product={product}
      categories={categories}
    />
  );
}
