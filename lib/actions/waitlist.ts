'use server'

import { createServerClient } from '@/lib/supabase/server'

export async function addToWaitlist(
  productId: string,
  contact: string,
): Promise<{ error?: string }> {
  if (!contact?.trim()) return { error: 'Укажите email или телефон' }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { error: 'База данных не настроена' }

  try {
    const supabase = createServerClient()
    const { error } = await supabase
      .from('waitlist')
      .insert({ product_id: productId, contact: contact.trim() })
    if (error) return { error: error.message }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ошибка' }
  }
}

export async function createPreorder(data: {
  productId: string
  name: string
  phone: string
  comment?: string
}): Promise<{ error?: string }> {
  if (!data.name?.trim())  return { error: 'Укажите имя' }
  if (!data.phone?.trim()) return { error: 'Укажите телефон' }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { error: 'База данных не настроена' }

  try {
    const supabase = createServerClient()
    const { error } = await supabase
      .from('preorders')
      .insert({
        product_id: data.productId,
        name:       data.name.trim(),
        phone:      data.phone.trim(),
        comment:    data.comment?.trim() || null,
      })
    if (error) return { error: error.message }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ошибка' }
  }
}
