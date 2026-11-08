import {
  confirmIntake,
  finalizeIntake,
  cancelIntake,
} from "@/lib/market/intake";
import {
  createHelper,
  revokeHelper,
  configureHelperMode,
} from "@/lib/market/helper-access";
import { verifyReceipt } from "@/lib/market/verify-receipt";
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
      case "intake-open":
        await transaction(async (db) => {
          await lockRegister(db);
          await db.query(
            "update market_register set intake_enabled=$1 where id=1",
            [z.boolean().parse(body.enabled)],
          );
        });
        break;
      case "intake-confirm":
        await transaction((db) =>
          confirmIntake(db, z.uuid().parse(body.id), admin.id),
        );
        break;
      case "intake-finalize":
        await transaction((db) =>
          finalizeIntake(db, z.uuid().parse(body.id), body.basket, admin.id),
        );
        break;
      case "intake-cancel":
        await transaction((db) => cancelIntake(db, z.uuid().parse(body.id)));
        break;
      case "helper-create": {
        const name = z.string().trim().min(1).max(80).parse(body.name);
        const extensionId = z
          .string()
          .regex(/^[a-p]{32}$/)
          .parse(body.extensionId);
        const credential = await transaction((db) =>
          createHelper(db, name, extensionId, admin.id),
        );
        return json({ ...(await marketState()), helperCredential: credential });
      }
      case "helper-revoke":
        await transaction((db) => revokeHelper(db, z.uuid().parse(body.id)));
        break;
      case "helper-mode": {
        const scope = z.enum(["safe", "future", "trial"]).parse(body.scope);
        if (scope !== "safe") {
          z.literal(true).parse(body.acknowledged);
          if (process.env.MARKET_RECEIPT_LIVE_ENABLED !== "true")
            throw new Error(
              "Рабочая выдача ещё не включена в настройках сайта",
            );
        }
        await transaction((db) =>
          configureHelperMode(
            db,
            z.uuid().parse(body.id),
            scope,
            scope === "trial" ? z.uuid().parse(body.saleId) : undefined,
          ),
        );
        break;
      }

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
      case "show-receipt":
        await transaction(async (db) => {
          await lockRegister(db);
          const id = z.uuid().parse(body.id);
          const {
            rows: [current],
          } = await db.query(
            "select s.status from public.market_register r join public.market_sales s on s.id=r.current_sale_id where r.id=1",
          );
          if (current?.status === "pending")
            throw new Error("Сначала завершите или отмените текущую покупку");
          const {
            rows: [receipt],
          } = await db.query(
            "select s.id from public.market_sales s join public.market_receipt_jobs j on j.sale_id=s.id where s.id=$1 and s.status='paid' and s.receipt_url is not null and j.state='registered' and j.verified_at is not null",
            [id],
          );
          if (!receipt)
            throw new Error(
              "Для покупки ещё нет подтверждённого оригинального чека",
            );
          await db.query(
            "update public.market_register set current_sale_id=$1 where id=1",
            [id],
          );
        });
        break;
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
      case "receipt": {
        const proof = await verifyReceipt(
          z.string().trim().max(2048).parse(body.url),
          z.iso.datetime().parse(body.registeredAt),
        );
        await transaction((db) =>
          attachReceipt(db, z.uuid().parse(body.id), proof),
        );
        break;
      }
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
