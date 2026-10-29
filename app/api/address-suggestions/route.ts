import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { isTrustedRequestOrigin } from "@/lib/request-origin";
import {
  addressSuggestionInput,
  suggestAddresses,
} from "@/lib/address-suggestions";
export const runtime = "nodejs";
const usage = new Map<
  string,
  { minute: number; minuteCount: number; day: number; dayCount: number }
>();
let day = 0,
  requests = 0;
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isTrustedRequestOrigin(request))
    return Response.json(
      { error: "Доступ запрещён" },
      { status: 403, headers },
    );
  const session = request.cookies.get("cart_session")?.value;
  if (!session || !/^[a-f0-9-]{36}$/i.test(session))
    return Response.json(
      { error: "Обновите страницу" },
      { status: 403, headers },
    );
  if (!process.env.DADATA_API_KEY)
    return Response.json(
      { error: "Подсказки пока недоступны. Введите адрес вручную." },
      { status: 503, headers },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 4096)
    return Response.json(
      { error: "Слишком длинный запрос" },
      { status: 413, headers },
    );
  try {
    const input = addressSuggestionInput.safeParse(await request.json());
    if (!input.success)
      return Response.json(
        { error: "Уточните адрес" },
        { status: 422, headers },
      );
    const now = Date.now(),
      today = Math.floor(now / 86400000),
      minute = Math.floor(now / 60000);
    if (day !== today) {
      day = today;
      requests = 0;
      usage.clear();
    }
    const hash = createHash("sha256").update(session).digest("hex");
    const old = usage.get(hash),
      entry = old ?? { minute, minuteCount: 0, day: today, dayCount: 0 };
    if (entry.minute !== minute) {
      entry.minute = minute;
      entry.minuteCount = 0;
    }
    if (
      requests >= 9000 ||
      entry.minuteCount >= 60 ||
      entry.dayCount >= 300 ||
      (!old && usage.size >= 3000)
    )
      return Response.json(
        { error: "Лимит подсказок исчерпан. Введите адрес вручную." },
        { status: 429, headers },
      );
    entry.minuteCount++;
    entry.dayCount++;
    requests++;
    usage.set(hash, entry);
    return Response.json(
      {
        suggestions: await suggestAddresses(
          input.data,
          process.env.DADATA_API_KEY,
        ),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Не удалось загрузить подсказки. Можно ввести адрес вручную." },
      { status: 503, headers },
    );
  }
}
