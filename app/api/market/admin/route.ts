import { z } from "zod";
import { transferSchema } from "@/lib/market/model";
import { transaction } from "@/lib/db/pool";
import {
  createSale,
  cancelSale,
  saveInventory,
  lockRegister,
  addInventoryItem,
  confirmManualSale,
  attachReceipt,
} from "@/lib/market/store";
import {
  configuredMode,
  connectDisplay,
  marketState,
  manualMode,
} from "@/lib/market/server";
import {
  adminRequest,
  json,
  marketError,
  readMarketBody,
} from "@/lib/market/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await adminRequest()))
    return json({ error: "Войдите в управление студией" }, 401);
  try {
    return json(await marketState());
  } catch (e) {
    return marketError(e);
  }
}
export async function POST(request: Request) {
  const admin = await adminRequest();
  if (!admin) return json({ error: "Войдите в управление студией" }, 401);
  try {
    const body = await readMarketBody(request);
    switch (body.action) {
      case "show": {
        const method = z
          .enum(["robokassa", "cash", "transfer"])
          .parse(body.method ?? "robokassa");
        const mode = method === "robokassa" ? configuredMode() : manualMode();
        if (!mode)
          throw new Error(
            "Оплата не настроена. Проверьте подключение Робокассы",
          );
        await transaction((db) => createSale(db, body.basket, mode, method));
        break;
      }
      case "cancel":
        await transaction((db) => cancelSale(db, z.uuid().parse(body.id)));
        break;
      case "stock":
        await transaction((db) => saveInventory(db, body.data));
        break;
      case "add-item":
        await transaction((db) => addInventoryItem(db, body.data));
        break;
      case "confirm-manual":
        await transaction((db) =>
          confirmManualSale(db, z.uuid().parse(body.id), admin.id),
        );
        break;
      case "receipt":
        await transaction((db) =>
          attachReceipt(
            db,
            z.uuid().parse(body.id),
            z.string().trim().max(2048).parse(body.url),
          ),
        );
        break;
      case "transfer-settings": {
        const settings = transferSchema.parse(body.data);
        await transaction(async (db) => {
          await lockRegister(db);
          await db.query(
            "update public.market_register set transfer_settings=$1::jsonb where id=1",
            [JSON.stringify(settings)],
          );
        });
        break;
      }
      case "pair":
        await connectDisplay(
          z
            .string()
            .regex(/^[a-fA-F0-9\s-]{8,12}$/)
            .parse(body.code),
        );
        break;
      case "revoke":
        await transaction(async (db) => {
          await lockRegister(db);
          await db.query(
            "update public.market_displays set revoked=true where id=$1",
            [z.uuid().parse(body.id)],
          );
        });
        break;
      case "clear":
        await transaction(async (db) => {
          await lockRegister(db);
          const {
            rows: [sale],
          } = await db.query(
            "select s.status from public.market_register r join public.market_sales s on r.current_sale_id=s.id where r.id=1",
          );
          if (sale?.status === "pending")
            throw new Error("Сначала отмените покупку или дождитесь оплаты");
          await db.query(
            "update public.market_register set current_sale_id=null where id=1",
          );
        });
        break;
      default:
        throw new Error("Неизвестное действие");
    }
    return json(await marketState());
  } catch (e) {
    return marketError(e);
  }
}
