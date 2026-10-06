import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { syncCatalog } from "@/lib/delivery/catalog-sync";
import { ozonTransport, shipmentMethodId } from "@/lib/delivery/ozon";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 401 });
  try {
    const result = await syncCatalog(
      createServerClient(),
      ozonTransport(),
      await shipmentMethodId(),
      240000,
    );
    console.info("Ozon scheduled catalogue sync", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Ozon scheduled catalogue sync failed",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "Не удалось обновить каталог" },
      { status: 503 },
    );
  }
}
