import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Product, Category } from '@/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Internal row shapes ───────────────────────────────────────────────────────

type ProductImageRow = {
  public_url: string
  alt_text: string | null
  sort_order: number
  is_primary: boolean
}

type CategoryRow = {
  id: string
  slug: string
  name: string
  sort_order: number
}

type ProductRow = {
  id: string
  category_id: string | null
  slug: string
  sku: string | null
  name: string
  description: string | null
  price: number
  in_stock: boolean
  stock_qty: number
  created_at: string
  updated_at: string
  material: string | null
  dimensions: string | null
  weight: string | null
  dishwasher_safe: boolean | null
  microwave_safe: boolean | null
  categories: CategoryRow | null
  product_images: ProductImageRow[]
}

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
  created_at,
  updated_at,
  material,
  dimensions,
  weight,
  dishwasher_safe,
  microwave_safe,
  categories (
    id,
    slug,
    name,
    sort_order
  ),
  product_images (
    public_url,
    alt_text,
    sort_order,
    is_primary
  )
` as const

// ── Mapper ────────────────────────────────────────────────────────────────────
// Invariant: images[0] === primary_image_url (always).

function mapProduct(row: ProductRow): Product {
  const images = (row.product_images ?? [])
    .sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
      return a.sort_order - b.sort_order
    })
    .map((img) => img.public_url)

  return {
    id: row.id,
    category_id: row.category_id ?? '',
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    description: row.description ?? '',
    price: row.price,
    primary_image_url: images[0] ?? null,
    images,
    in_stock: row.in_stock,
    stock_qty: row.stock_qty,
    created_at: row.created_at,
    updated_at: row.updated_at,
    material: row.material ?? null,
    dimensions: row.dimensions ?? null,
    weight: row.weight ?? null,
    dishwasher_safe: row.dishwasher_safe ?? null,
    microwave_safe: row.microwave_safe ?? null,
    category: row.categories
      ? {
          id: row.categories.id,
          slug: row.categories.slug,
          name: row.categories.name,
          sort_order: row.categories.sort_order,
        }
      : undefined,
  }
}

// ── Public queries ────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, slug, name, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('getCategories error:', error)
    return []
  }

  return (data ?? []) as Category[]
}

export async function getFilterCategories() {
  const categories = await getCategories()
  return [
    { slug: 'all', label: 'Все работы' },
    ...categories.map((c) => ({ slug: c.slug, label: c.name })),
  ]
}

export async function getProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getProducts error:', error)
    return []
  }

  return (data ?? []).map((row) => mapProduct(row as unknown as ProductRow))
}

// cache() memoises per request: generateMetadata and ProductPage both call
// this function with the same slug — only the first call hits the DB.
export const getProductBySlug = cache(async (slug: string): Promise<Product | undefined> => {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (error) {
    console.error('getProductBySlug error:', error)
    return undefined
  }

  return mapProduct(data as unknown as ProductRow)
})

// Targeted fetch — used by getCart() to hydrate only the products
// actually present in the cart, not the entire catalog.
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .in('id', ids)
    .eq('is_active', true)

  if (error) {
    console.error('getProductsByIds error:', error)
    return []
  }

  return (data ?? []).map((row) => mapProduct(row as unknown as ProductRow))
}

// Fetches up to `limit` products related to a given category, excluding the
// current product.  Two-step:
//   1. Same-category products first (most relevant).
//   2. If fewer than `limit` found, fill remaining slots from any other category.
// Uses chained .neq() for exclusion — safer than raw PostgREST not-in strings.
export async function getRelatedProducts(
  categoryId: string,
  excludeSlug: string,
  limit = 4,
): Promise<Product[]> {
  // Step 1 — same category, excluding current product
  const { data: sameData, error: sameErr } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .eq('category_id', categoryId)
    .neq('slug', excludeSlug)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (sameErr) console.error('getRelatedProducts (same) error:', sameErr)

  const same = (sameData ?? []).map((r) => mapProduct(r as unknown as ProductRow))
  if (same.length >= limit) return same

  // Step 2 — fill remaining slots from any category
  const needed = limit - same.length
  const takenSlugs = [excludeSlug, ...same.map((p) => p.slug)]

  // Start with a fully-typed builder; .neq() returns the same builder type
  // so TypeScript infers the chain correctly without any `any` annotation.
  let fallbackQuery = supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(needed)

  for (const s of takenSlugs) {
    fallbackQuery = fallbackQuery.neq('slug', s)
  }

  const { data: fallbackData, error: fallbackErr } = await fallbackQuery
  if (fallbackErr) console.error('getRelatedProducts (fallback) error:', fallbackErr)

  const fallback = (fallbackData ?? []).map((r) => mapProduct(r as unknown as ProductRow))
  return [...same, ...fallback]
}

export async function getProductsByCategory(categorySlug?: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getProductsByCategory error:', error)
    return []
  }

  const mapped = (data ?? []).map((row) => mapProduct(row as unknown as ProductRow))

  if (!categorySlug || categorySlug === 'all') return mapped
  return mapped.filter((p) => p.category?.slug === categorySlug)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}
