import { syncOzonReturns } from "@/lib/delivery/returns-sync";
import { syncOrderShipments } from "@/lib/delivery/shipment-sync";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Доступ запрещён" }, { status: 401 });
  try {
    const result = await syncOrderShipments();
    let returns;
    try { returns = await syncOzonReturns(); }
    catch { returns = { checked: 0, failed: 1 }; }
    console.info("Order shipment sync", { ...result, returns });
    return Response.json({ ...result, returns }, { status: result.failed || returns.failed ? 503 : 200 });
  } catch {
    return Response.json(
      { error: "Не удалось обновить доставку" },
      { status: 503 },
    );
  }
}
