// GET  /api/orders          — список заказов с пагинацией (для admin)
// POST /api/orders          — создать заказ через HTTP (альтернатива Server Action)
//
// ⚠️  Эти маршруты доступны без аутентификации.
//     Перед выводом в продакшн добавить проверку токена:
//     const auth = request.headers.get('Authorization')
//     if (auth !== `Bearer ${process.env.ADMIN_API_TOKEN}`) return 401

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

// ── GET /api/orders ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const { searchParams } = new URL(request.url)

  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20'))
  const from  = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('orders')
    .select(
      `*,
       customer:customers(id, name, phone, email),
       items:order_items(*)`,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      pages: Math.ceil((count ?? 0) / limit),
    },
  })
}

// ── POST /api/orders ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Невалидный JSON' }, { status: 400 })
  }

  // Делегируем в Server Action
  const { createOrder } = await import('@/lib/actions/orders')
  const { formData } = body as {
    formData: Parameters<typeof createOrder>[0]
  }

  if (!formData) {
    return NextResponse.json(
      { error: 'Ожидается поле formData' },
      { status: 400 }
    )
  }

  const result = await createOrder(formData)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json({ orderId: result.orderId }, { status: 201 })
}
