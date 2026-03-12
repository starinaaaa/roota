'use server'

import { createServerClient } from '@/lib/supabase/server'
import type { CheckoutFormData, CreateOrderResult } from '@/types'
import type { CartItem } from '@/lib/store/cartStore'

// ── Валидация ────────────────────────────────────────────────────────────────

function validatePhone(phone: string): boolean {
  // E.164: +7XXXXXXXXXX (11 цифр после +7) или другие форматы
  return /^\+?\d{10,15}$/.test(phone.replace(/[\s\-()]/g, ''))
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('8') && digits.length === 11) {
    return '+7' + digits.slice(1)
  }
  if (digits.startsWith('7') && digits.length === 11) {
    return '+' + digits
  }
  if (!phone.startsWith('+')) {
    return '+' + digits
  }
  return phone
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function createOrder(
  formData: CheckoutFormData,
  items: CartItem[]
): Promise<CreateOrderResult> {

  // ── 1. Валидация входных данных ──────────────────────────────────────────
  if (!items || items.length === 0) {
    return { success: false, error: 'Корзина пуста' }
  }
  if (!formData.name?.trim()) {
    return { success: false, error: 'Укажите имя' }
  }
  if (!formData.phone?.trim() || !validatePhone(formData.phone)) {
    return { success: false, error: 'Укажите корректный номер телефона' }
  }
  if (!formData.delivery_address?.trim()) {
    return { success: false, error: 'Укажите адрес доставки' }
  }

  const supabase = createServerClient()

  // ── 2. Upsert customer (по номеру телефона) ──────────────────────────────
  const phone = normalizePhone(formData.phone)

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .upsert(
      {
        name:  formData.name.trim(),
        phone,
        email: formData.email?.trim() || null,
      },
      { onConflict: 'phone' }
    )
    .select('id')
    .single()

  if (customerError || !customer) {
    console.error('[createOrder] customer upsert error:', customerError)
    return { success: false, error: 'Ошибка сохранения данных покупателя' }
  }

  // ── 3. Подсчёт суммы ─────────────────────────────────────────────────────
  const total_amount = items.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0
  )

  // ── 4. Insert order ──────────────────────────────────────────────────────
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      customer_id:      customer.id,
      status:           'new',
      total_amount,
      delivery_type:    formData.delivery_type,
      delivery_address: formData.delivery_address.trim(),
      comment:          formData.comment?.trim() || null,
      payment_status:   'pending',
    })
    .select('id')
    .single()

  if (orderError || !order) {
    console.error('[createOrder] order insert error:', orderError)
    return { success: false, error: 'Ошибка создания заказа' }
  }

  // ── 5. Insert order_items ────────────────────────────────────────────────
  const orderItems = items.map(i => ({
    order_id:     order.id,
    product_id:   i.product.id,
    quantity:     i.quantity,
    price:        i.product.price,
    product_name: i.product.name,
    product_slug: i.product.slug,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    // Заказ создан, но состав не записан — логируем и сообщаем об ошибке
    // В продакшне: использовать транзакцию через supabase.rpc('create_order_tx', {...})
    console.error('[createOrder] order_items insert error:', itemsError)
    return { success: false, error: 'Ошибка сохранения состава заказа' }
  }

  return { success: true, orderId: order.id }
}
