import { paymentForOrderToken } from "@/lib/order-access";
import { publicPaymentStatus } from "@/lib/payments/robokassa";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  try {
    const payment = await paymentForOrderToken((await params).token);
    return Response.json(
      payment ? publicPaymentStatus(payment) : { error: "Заказ не найден" },
      { status: payment ? 200 : 404, headers },
    );
  } catch {
    return Response.json(
      { error: "Не удалось обновить статус" },
      { status: 503, headers },
    );
  }
}
