'use server'

import { createServerClient } from '@/lib/supabase/server'
import { getCart, clearCart } from './cart'
import type { CheckoutFormData, CreateOrderResult } from '@/types'

export async function createOrder(formData: CheckoutFormData): Promise<CreateOrderResult> {
  // Validate required fields
  if (!formData.name?.trim())        return { success: false, error: 'Укажите имя' }
  if (!formData.phone?.trim())       return { success: false, error: 'Укажите телефон' }
  if (!formData.deliveryType)        return { success: false, error: 'Выберите тип доставки' }

  // Read cart from DB (server-side source of truth — client never passes items)
  const { items } = await getCart()
  if (items.length === 0) return { success: false, error: 'Корзина пуста' }

  // Graceful fallback when Supabase is not configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { success: false, error: 'База данных не настроена. Добавьте ключи Supabase в .env.local' }
  }

  try {
    const supabase = createServerClient()

    // Upsert customer by phone (one customer per phone number)
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .upsert(
        {
          phone: formData.phone.trim(),
          name:  formData.name.trim(),
          email: formData.email?.trim() || null,
        },
        { onConflict: 'phone' }
      )
      .select('id')
      .single()

    if (custErr || !customer) {
      return { success: false, error: custErr?.message ?? 'Ошибка создания клиента' }
    }

    // Calculate total from server-side cart
    const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

    // Insert order — includes both FK customer_id and denormalised customer fields
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_id:      customer.id,
        customer_name:    formData.name.trim(),
        customer_phone:   formData.phone.trim(),
        customer_email:   formData.email?.trim() || null,
        total_amount:     total,
        delivery_type:    formData.deliveryType,
        delivery_address: formData.address?.trim() || null,
        comment:          formData.comment?.trim() || null,
        status:           'new',
        payment_status:   'pending',
      })
      .select('id')
      .single()

    if (orderErr || !order) {
      return { success: false, error: orderErr?.message ?? 'Ошибка создания заказа' }
    }

    // Insert order items — snapshot name/slug at order time (NOT NULL in schema)
    const orderItems = items.map((item) => ({
      order_id:     order.id,
      product_id:   item.product_id,
      quantity:     item.quantity,
      price:        item.product.price,
      product_name: item.product.name,
      product_slug: item.product.slug,
    }))

    const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)

    if (itemsErr) {
      return { success: false, error: itemsErr.message }
    }

    // Clear cart after successful order
    await clearCart()

    return { success: true, orderId: order.id }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Неизвестная ошибка' }
  }
}
