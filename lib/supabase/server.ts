// Серверный клиент Supabase — использует service role key, обходит RLS.
// Импортировать ТОЛЬКО внутри Server Actions, Route Handlers и Server Components.
// Никогда не передавать этот клиент в браузер — ключ не должен попасть к пользователю.

import { createClient as _createClient } from '@supabase/supabase-js'

export function createServerClient() {
  return _createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
