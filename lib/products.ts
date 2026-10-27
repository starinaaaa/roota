import { reviewHidden } from "./review-hidden";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import "server-only";
import { createServerClient } from "./db";
import type { Product, Category } from "@/types";

const supabase = createServerClient;

// ── Internal row shapes ───────────────────────────────────────────────────────

type ProductImageRow = {
  id: string;
  public_url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
};

type ProductRow = {
  id: string;
  category_id: string | null;
  slug: string;
  sku: string | null;
  name: string;
  description: string | null;
  price: number;
  in_stock: boolean;
  stock_qty: number;
  product_kind: "batch" | "unique";
  configurator: "garden" | null;
  created_at: string;
  updated_at: string;
  material: string | null;
  dimensions: string | null;
  weight: string | null;
  capacity_ml: number | null;
  dishwasher_safe: boolean | null;
  microwave_safe: boolean | null;
  care: string | null;
  preorder_enabled: boolean;
  lead_time_days: number | null;
  seo_title: string | null;
  seo_description: string | null;
  featured: boolean;
  featured_order: number;
  categories: CategoryRow | null;
  product_images: ProductImageRow[];
};

// Single select fragment — identical shape across all queries
const PRODUCT_SELECT = `
  id,
  category_id,
  slug,
  sku,
  name,
  description,
  price,
  in_stock,
  stock_qty,
  product_kind,
  configurator,
  created_at,
  updated_at,
  material,
  dimensions,
  weight,
  capacity_ml,
  dishwasher_safe,
  microwave_safe,
  care,
  preorder_enabled,
  lead_time_days,
  seo_title,
  seo_description,
  featured,
  featured_order,
  categories (
    id,
    slug,
    name,
    sort_order
  ),
  product_images (
    id,
    public_url,
    alt_text,
    sort_order,
    is_primary
  )
` as const;

// ── Mapper ────────────────────────────────────────────────────────────────────
// Invariant: images[0] === primary_image_url (always).

function mapProduct(row: ProductRow): Product {
  const images = (row.product_images ?? [])
    .sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return a.sort_order - b.sort_order;
    })
    .map((img) => /^\/images\/garden\/garden-[1-5]\.webp$/.test(img.public_url) ? img.public_url : `/media/${row.id}/${img.id}`);

  return {
    id: row.id,
    category_id: row.category_id ?? "",
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    description: row.description ?? "",
    price: row.price,
    primary_image_url: images[0] ?? null,
    images,
    in_stock: row.in_stock,
    stock_qty: row.stock_qty,
    product_kind: row.product_kind,
    configurator: row.configurator,
    created_at: row.created_at,
    updated_at: row.updated_at,
    material: row.material ?? null,
    dimensions: row.dimensions ?? null,
    weight: row.weight ?? null,
    capacity_ml: row.capacity_ml ?? null,
    dishwasher_safe: row.dishwasher_safe ?? null,
    microwave_safe: row.microwave_safe ?? null,
    care: row.care,
    preorder_enabled: row.preorder_enabled,
    lead_time_days: row.lead_time_days,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    featured: row.featured,
    featured_order: row.featured_order,
    category: row.categories
      ? {
          id: row.categories.id,
          slug: row.categories.slug,
          name: row.categories.name,
          sort_order: row.categories.sort_order,
        }
      : undefined,
  };
}

// Only public catalogue DTOs enter the shared cache. Carts and orders never do.
// Keep the current route rendering model; Cache Components can be enabled separately.
export const getCategories = unstable_cache(async (): Promise<Category[]> => {
  const { data, error } = await supabase().from("categories").select("id,slug,name,sort_order").eq("is_active",true).order("sort_order");
  if (error) throw new Error("CATALOGUE_UNAVAILABLE");
  return data ?? [];
}, ["public-categories"], { tags: ["catalog"], revalidate: 60 });

export const getProducts = unstable_cache(async (): Promise<Product[]> => {
  const { data, error } = await supabase().from("products").select(PRODUCT_SELECT).eq("publication_status","published").eq("is_active",true).order("created_at",{ascending:false});
  if (error) throw new Error("CATALOGUE_UNAVAILABLE");
  return (data ?? []).filter(row => !reviewHidden.products.includes(row.id)).map(row=>mapProduct(row as unknown as ProductRow));
}, ["public-products"], { tags: ["catalog"], revalidate: 60 });

export async function getFilterCategories() {
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);
  const populated = new Set(products.map(p => p.category_id));
  return [{slug:"all",label:"Все работы"},...categories.filter(c => populated.has(c.id)).map(c=>({slug:c.slug,label:c.name}))];
}
export const getProductBySlug = cache(async (slug: string) => (await getProducts()).find(p=>p.slug===slug));

// Checkout/cart hydration reads current inventory without shared caching.
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase().from("products").select(PRODUCT_SELECT).in("id",ids).eq("publication_status","published").eq("is_active",true);
  if (error) throw new Error("CATALOGUE_UNAVAILABLE");
  return (data ?? []).filter(row => !reviewHidden.products.includes(row.id)).map(row=>mapProduct(row as unknown as ProductRow));
}
export async function getRelatedProducts(categoryId: string, excludeSlug: string, limit=4) {
  return (await getProducts()).filter(p=>p.slug!==excludeSlug).sort((a,b)=>Number(b.category_id===categoryId)-Number(a.category_id===categoryId)).slice(0,limit);
}
export async function getProductsByCategory(slug?: string) {
  const products=await getProducts();
  return !slug || slug==='all' ? products : products.filter(p=>p.category?.slug===slug);
}
