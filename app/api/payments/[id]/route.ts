import { NextRequest, NextResponse } from "next/server";
import { ownedPayment, publicPaymentStatus } from "@/lib/payments/robokassa";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payment = await ownedPayment((await params).id);
    return NextResponse.json(
      payment ? publicPaymentStatus(payment) : { error: "Не найдено" },
      {
        status: payment ? 200 : 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Не удалось проверить оплату" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
