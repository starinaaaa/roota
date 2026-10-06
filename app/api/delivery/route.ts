import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import {
  deliveryContext,
  deliverySession,
  publicPoint,
  quoteDelivery,
} from "@/lib/delivery/service";
import { pointInCity } from "@/lib/delivery/model";
import { ozon } from "@/lib/delivery/ozon";
export const runtime = "nodejs";
export const maxDuration = 60;
const requestSchema = z.object({
  action: z.enum(["points", "quote"]),
  phone: z.string().max(40),
  city: z.string().trim().min(2, "Укажите город").max(100),
  pointId: z.number().int().positive().optional(),
  offset: z.number().int().min(0).max(50000).optional(),
});
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  try {
    const input = requestSchema.safeParse(await request.json());
    if (!input.success)
      return NextResponse.json(
        { error: "Укажите телефон и город." },
        { status: 422 },
      );
    await deliverySession();
    const d = input.data;
    if (d.action === "quote") {
      if (!d.pointId) throw new Error("Выберите пункт выдачи.");
      return NextResponse.json(
        { quote: await quoteDelivery(d.phone, d.city, d.pointId) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const context = await deliveryContext(d.phone);
    await ozon.checkRecipient(context.phone);
    const pattern = "%" + d.city.replace(/[\\%_]/g, "\\$&") + "%";
    const offset = d.offset ?? 0;
    const { data, error } = await createServerClient()
      .from("delivery_points")
      .select("id,data")
      .eq("provider", "ozon")
      .eq("active", true)
      .ilike("address", pattern)
      .order("address")
      .order("id")
      .range(offset, offset + 49);
    if (error)
      throw new Error("Не удалось получить пункты выдачи. Повторите позже.");
    const cityPoints = (data ?? []).filter((p) =>
      pointInCity(p.data.full_address, d.city),
    );
    const ids = cityPoints.map((p) => Number(p.id));
    const available = await ozon.checkPoints(ids, context);
    return NextResponse.json(
      {
        points: cityPoints
          .filter((p) => available.includes(Number(p.id)))
          .map((p) => publicPoint(p.data)),
        nextOffset: data?.length === 50 ? offset + 50 : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error &&
          !/fetch|JSON|network|abort|timeout/i.test(error.message)
            ? error.message
            : "Не удалось связаться со службой доставки. Повторите попытку.",
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
}
