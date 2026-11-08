import { createHmac, randomBytes } from "node:crypto";
import { getPool, transaction } from "@/lib/db/pool";
import { createIntake } from "@/lib/market/intake";
import { manualMode, configuredMode } from "@/lib/market/server";
import { json, marketError, readMarketBody } from "@/lib/market/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const {
      rows: [r],
    } = await getPool().query(
      "select intake_enabled from market_register where id=1",
    );
    const response = json({
      enabled: r.intake_enabled,
      robokassa: !!configuredMode(),
    });
    if (
      !/roota_market_intake=[a-f0-9]{64}(?:;|$)/.test(
        request.headers.get("cookie") ?? "",
      )
    )
      response.headers.append(
        "Set-Cookie",
        `roota_market_intake=${randomBytes(32).toString("hex")}; Path=/api/market/intake; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(process.env.NEXT_PUBLIC_SITE_URL ?? request.url).protocol === "https:" ? "; Secure" : ""}`,
      );
    return response;
  } catch (e) {
    return marketError(e);
  }
}
export async function POST(request: Request) {
  try {
    const body = await readMarketBody(request);
    const mode = body.method === "robokassa" ? configuredMode() : manualMode();
    if (!mode) throw Error("Оплата через Робокассу сейчас недоступна");
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw Error("Приём покупок временно недоступен");
    const session = /(?:^|;\s*)roota_market_intake=([a-f0-9]{64})(?:;|$)/.exec(
      request.headers.get("cookie") ?? "",
    )?.[1];
    if (!session) throw Error("Обновите страницу покупки и повторите");
    const hash = createHmac("sha256", secret)
      .update(new Date().toISOString().slice(0, 10) + ":" + session)
      .digest("hex");
    const r = await transaction((db) => createIntake(db, body, mode, hash));
    return json({ url: `/market/request/${r.token}` });
  } catch (e) {
    return marketError(e);
  }
}
