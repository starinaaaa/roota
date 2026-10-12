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

// Cities and prepared carrier snapshots contain no customer data.
export async function GET(request: NextRequest) {
  const { normalizeCity, majorCities } = await import("@/lib/delivery/geo");
  const params = request.nextUrl.searchParams;
  const action = params.get("action"),
    query = params.get("q")?.trim() ?? "";
  if (
    !["cities", "catalog"].includes(action ?? "") ||
    query.length < 2 ||
    query.length > 100
  )
    return NextResponse.json({ error: "Укажите город." }, { status: 422 });
  const city = normalizeCity(query),
    db = createServerClient();
  const headers = {
    "Cache-Control": "public, max-age=300",
    "Vercel-CDN-Cache-Control":
      "public, s-maxage=3600, stale-while-revalidate=300",
  };
  if (action === "cities") {
    const pattern = city.replace(/[\\%_]/g, "\\$&") + "%";
    const { data, error } = await db
      .from("delivery_city_catalog")
      .select("name,latitude,longitude")
      .like("city_key", pattern)
      .order("name")
      .limit(12);
    if (error)
      return NextResponse.json(
        { error: "Не удалось загрузить города." },
        { status: 503 },
      );
    const preferred = majorCities.filter((candidate) =>
      normalizeCity(candidate.name).startsWith(city),
    );
    const suggestions = new Map(preferred.map((city) => [city.name, city]));
    for (const city of data ?? [])
      if (!suggestions.has(city.name)) suggestions.set(city.name, city);
    return NextResponse.json(
      { cities: [...suggestions.values()].slice(0, 12) },
      { headers },
    );
  }
  const coordinate = (key: string, bound: number) => {
    const value = params.get(key);
    if (value === null) return null;
    const number = Number(value);
    if (!value || !Number.isFinite(number) || Math.abs(number) > bound)
      throw new Error("COORDINATES");
    return number;
  };
  try {
    const lat = coordinate("lat", 90),
      lon = coordinate("lon", 180);
    const bounds = params.has("bounds")
      ? params.get("bounds")!.split(",").map(Number)
      : null;
    if (
      bounds &&
      (bounds.length !== 4 ||
        bounds.some((n) => !Number.isFinite(n)) ||
        Math.abs(bounds[0]) > 90 ||
        Math.abs(bounds[2]) > 90 ||
        Math.abs(bounds[1]) > 180 ||
        Math.abs(bounds[3]) > 180 ||
        bounds[0] > bounds[2] ||
        bounds[1] > bounds[3])
    )
      throw new Error("BOUNDS");
    const address = params.get("address")?.trim() ?? "";
    if (address.length > 100) throw new Error("ADDRESS");
    const { data, error } = await db.rpc("delivery_catalog_slice", {
      p_city: city,
      p_lat: lat,
      p_lon: lon,
      p_bounds: bounds,
      p_query: address,
      p_limit: 150,
    });
    if (error)
      return NextResponse.json(
        { error: "Не удалось загрузить пункты выдачи." },
        { status: 503 },
      );
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json(
      { error: "Проверьте область поиска." },
      { status: 422 },
    );
  }
}
