// Браузерный клиент Supabase — использует anon key.
// Безопасно импортировать в клиентских компонентах ('use client').
// Вызывать как factory, а не синглтон, чтобы не было stale state.

import { createClient as _createClient } from '@supabase/supabase-js'

export function createClient() {
  return _createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
