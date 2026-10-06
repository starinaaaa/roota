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

// Public projection of the carrier catalogue; never expose private delivery rows.
export async function GET(request: NextRequest) {
  const { addressCity, coordinates, majorCities, normalizeCity } =
    await import("@/lib/delivery/geo");
  const action = request.nextUrl.searchParams.get("action"),
    query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (
    !["cities", "catalog"].includes(action ?? "") ||
    query.length < 2 ||
    query.length > 100
  )
    return NextResponse.json({ error: "Укажите город." }, { status: 422 });
  const search = normalizeCity(query);
  const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
    return NextResponse.json(
      { error: "Некорректная страница." },
      { status: 422 },
    );
  const { data, error } = await createServerClient()
    .from("delivery_points")
    .select("data")
    .eq("provider", "ozon")
    .eq("active", true)
    .ilike("address", pattern)
    .order("address")
    .order("id")
    .range(
      action === "cities" ? 0 : offset,
      action === "cities" ? 999 : offset + 499,
    );
  if (error)
    return NextResponse.json(
      { error: "Не удалось загрузить пункты выдачи." },
      { status: 503 },
    );
  if (action === "cities") {
    const cities = new Map(
      majorCities
        .filter((c) => normalizeCity(c.name).startsWith(search))
        .map((c) => [c.name, c]),
    );
    for (const row of data ?? []) {
      const name = addressCity(row.data.full_address),
        position = coordinates(row.data.coordinates);
      if (
        name &&
        position &&
        normalizeCity(name).startsWith(search) &&
        !cities.has(name)
      )
        cities.set(name, { name, ...position });
    }
    return NextResponse.json(
      { cities: [...cities.values()].slice(0, 12) },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
  if (!data?.length && !offset) {
    const { count } = await createServerClient()
      .from("delivery_points")
      .select("id", { count: "exact", head: true })
      .eq("provider", "ozon")
      .eq("active", true);
    if (!count)
      return NextResponse.json(
        { error: "Каталог пунктов Ozon временно недоступен. Повторите позже." },
        { status: 503 },
      );
  }
  return NextResponse.json(
    {
      points: (data ?? [])
        .filter((p) => pointInCity(p.data.full_address, search))
        .map((p) => publicPoint(p.data)),
      nextOffset: data?.length === 500 ? offset + 500 : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
