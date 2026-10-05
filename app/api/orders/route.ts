import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ── GET /api/orders ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!(await getAdmin()))
    return NextResponse.json(
      { error: "Доступ запрещён" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.max(
    1,
    Math.min(50, Number(searchParams.get("limit")) || 20),
  );
  if (!Number.isInteger(page) || !Number.isInteger(limit))
    return NextResponse.json(
      { error: "Некорректная страница" },
      { status: 400 },
    );
  const from = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from("orders")
    .select(
      `*,
       customer:customers(id, name, phone, email),
       items:order_items(*)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: "Не удалось загрузить заказы" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      data,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        pages: Math.ceil((count ?? 0) / limit),
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// ── POST /api/orders ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 });
  }

  // Делегируем в Server Action
  const { createOrder } = await import("@/lib/actions/orders");
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  const { formData, requestKey, expectedTotal } = body as {
    formData: Parameters<typeof createOrder>[0];
    requestKey: string;
    expectedTotal: number;
  };

  if (!formData) {
    return NextResponse.json(
      { error: "Ожидается поле formData" },
      { status: 400 },
    );
  }

  const result = await createOrder(formData, requestKey, expectedTotal);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json(
    { orderId: result.orderId, orderNumber: result.orderNumber },
    { status: 201 },
  );
}
