'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { getProductsByIds } from '@/lib/products'
import type { CartItem } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getSessionId(): Promise<string> {
  const cookieStore = await cookies()
  return cookieStore.get('cart_session')?.value ?? ''
}

async function getOrCreateCart(sessionId: string): Promise<string | null> {
  if (!sessionId) return null

  const supabase = createServerClient()

  const { data: existing } = await supabase
    .from('carts')
    .select('id')
    .eq('session_id', sessionId)
    .single()

  if (existing) return existing.id

  const { data: created } = await supabase
    .from('carts')
    .insert({ session_id: sessionId })
    .select('id')
    .single()

  return created?.id ?? null
}

// ── getCart ───────────────────────────────────────────────────────────────────
//
// Two optimisations vs. the previous version:
//
// 1. Collapsed two sequential DB calls (carts → cart_items) into one nested
//    select — saves a full round-trip to Supabase on every page render.
//
// 2. Replaced getProducts() (full table scan of every product + product_images)
//    with getProductsByIds(ids) — only fetches the products actually in the cart.
//    When the cart is empty the products query is skipped entirely.

export async function getCart(): Promise<{ items: CartItem[] }> {
  const sessionId = await getSessionId()
  if (!sessionId) return { items: [] }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { items: [] }

  try {
    const supabase = createServerClient()

    // Single query: cart + its items in one round-trip
    const { data: cart } = await supabase
      .from('carts')
      .select('id, cart_items(id, cart_id, product_id, quantity)')
      .eq('session_id', sessionId)
      .single()

    const rows = (cart?.cart_items ?? []) as Array<{
      id: string
      cart_id: string
      product_id: string
      quantity: number
    }>

    if (rows.length === 0) return { items: [] }

    // Only fetch the products that are actually in the cart
    const productIds = rows.map((r) => r.product_id)
    const products = await getProductsByIds(productIds)

    const items: CartItem[] = rows
      .map((row) => {
        const product = products.find((p) => p.id === row.product_id)
        if (!product) return null
        return {
          id: row.id,
          cart_id: row.cart_id,
          product_id: row.product_id,
          quantity: row.quantity,
          product,
        } as CartItem
      })
      .filter((item): item is CartItem => item !== null)

    return { items }
  } catch {
    return { items: [] }
  }
}

// ── addToCart ─────────────────────────────────────────────────────────────────

export async function addToCart(productId: string, qty = 1): Promise<void> {
  const sessionId = await getSessionId()
  if (!sessionId || !process.env.NEXT_PUBLIC_SUPABASE_URL) return

  try {
    const supabase = createServerClient()
    const cartId = await getOrCreateCart(sessionId)
    if (!cartId) return

    const { data: existing } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('cart_id', cartId)
      .eq('product_id', productId)
      .single()

    if (existing) {
      await supabase
        .from('cart_items')
        .update({ quantity: existing.quantity + qty })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('cart_items')
        .insert({ cart_id: cartId, product_id: productId, quantity: qty })
    }
  } catch (err) {
    console.error('[addToCart] error:', err)
  }
}

// ── removeFromCart ────────────────────────────────────────────────────────────

export async function removeFromCart(productId: string): Promise<void> {
  const sessionId = await getSessionId()
  if (!sessionId || !process.env.NEXT_PUBLIC_SUPABASE_URL) return

  try {
    const supabase = createServerClient()

    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('session_id', sessionId)
      .single()

    if (!cart) return

    await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cart.id)
      .eq('product_id', productId)
  } catch {}
}

// ── updateCartItem ────────────────────────────────────────────────────────────

export async function updateCartItem(productId: string, qty: number): Promise<void> {
  if (qty <= 0) {
    await removeFromCart(productId)
    return
  }

  const sessionId = await getSessionId()
  if (!sessionId || !process.env.NEXT_PUBLIC_SUPABASE_URL) return

  try {
    const supabase = createServerClient()

    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('session_id', sessionId)
      .single()

    if (!cart) return

    await supabase
      .from('cart_items')
      .update({ quantity: qty })
      .eq('cart_id', cart.id)
      .eq('product_id', productId)
  } catch {}
}

// ── clearCart ─────────────────────────────────────────────────────────────────

export async function clearCart(): Promise<void> {
  const sessionId = await getSessionId()
  if (!sessionId || !process.env.NEXT_PUBLIC_SUPABASE_URL) return

  try {
    const supabase = createServerClient()

    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('session_id', sessionId)
      .single()

    if (!cart) return

    await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cart.id)
  } catch {}
}
