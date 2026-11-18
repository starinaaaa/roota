import { createHmac, randomBytes } from "node:crypto";
import { getPool, transaction } from "@/lib/db/pool";
import { createIntake, finalizeIntake } from "@/lib/market/intake";
import {
  manualMode,
  configuredMode,
  preparePayment,
} from "@/lib/market/server";
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
    const { intake, sale } = await transaction(async (db) => {
      const intake = await createIntake(db, body, mode, hash);
      // Previously composed requests keep their original items and payment link.
      const sale =
        intake.method === "robokassa" && !intake.sale_id
          ? await finalizeIntake(db, intake.id, { generic: true }, "")
          : null;
      return { intake, sale };
    });
    if (sale)
      return json({
        url: `/market/pay/${sale.token}`,
        form: await preparePayment(
          sale.token,
          intake.email,
          intake.marketing_consent,
          intake.review_consent,
        ),
      });
    return json({ url: `/market/request/${intake.token}` });
  } catch (e) {
    return marketError(e);
  }
}
