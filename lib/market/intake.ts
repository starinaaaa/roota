import { randomBytes } from "node:crypto";
import { z } from "zod";
import { basketSchema, quoteBasket } from "./model";
import {
  createSale,
  inventory,
  lockRegister,
  saveManualContact,
  confirmManualSale,
  type MarketDb,
  type SaleRow,
} from "./store";

export function amountInKopecks(value: string) {
  const s = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s))
    throw Error("Введите сумму в рублях, например 12000 или 12000,50");
  const [r, k = ""] = s.split(".");
  const n = Number(r) * 100 + Number(k.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n < 100 || n > 100000000)
    throw Error("Сумма должна быть от 1 до 1 000 000 ₽");
  return n;
}
export const intakeSchema = z
  .object({
    requestKey: z.uuid(),
    amount: z.string().max(30),
    email: z.email().max(254),
    method: z.enum(["cash", "transfer", "robokassa"]),
    accepted: z.literal(true),
    marketingConsent: z.boolean().default(false),
    reviewConsent: z.boolean().optional(),
  })
  .strict();
export type IntakeRow = {
  id: string;
  number: string;
  request_key: string;
  token: string;
  mode: "live" | "test";
  amount_kopecks: number;
  method: "cash" | "transfer" | "robokassa";
  email: string;
  marketing_consent: boolean;
  review_consent: boolean;
  created_at: Date;
  paid_at: Date | null;
  confirmed_by: string | null;
  terms_version: string;
  cancelled_at: Date | null;
  sale_id: string | null;
  transfer_details: unknown;
};
export const intakeNumber = (n: string) => `П-${String(n).padStart(6, "0")}`;
export async function createIntake(
  db: MarketDb,
  raw: unknown,
  mode: IntakeRow["mode"],
  clientHash: string,
) {
  const input = intakeSchema.parse(raw),
    amount = amountInKopecks(input.amount),
    email = input.email.trim().toLowerCase();
  await lockRegister(db);
  const {
    rows: [previous],
  } = await db.query<IntakeRow>(
    "select * from market_intakes where request_key=$1",
    [input.requestKey],
  );
  if (previous) {
    if (
      previous.amount_kopecks !== amount ||
      previous.email !== email ||
      previous.method !== input.method ||
      previous.mode !== mode ||
      previous.marketing_consent !== input.marketingConsent ||
      previous.review_consent !== (input.reviewConsent ?? true)
    )
      throw Error("Эта покупка уже создана с другими данными");
    return previous;
  }
  const {
    rows: [register],
  } = await db.query(
    "select intake_enabled,transfer_settings from market_register where id=1",
  );
  if (!register.intake_enabled)
    throw Error("Приём покупок по QR сейчас закрыт. Обратитесь к продавцу");
  const {
    rows: [limits],
  } = await db.query(
    "select count(*) filter(where created_at>now()-interval '15 minutes' and client_hash=$1)::int recent,count(*) filter(where created_at>now()-interval '1 day')::int daily from market_intakes",
    [clientHash],
  );
  if (limits.recent >= 10 || limits.daily >= 1000)
    throw Error("Слишком много покупок. Обратитесь к продавцу");
  const {
    rows: [result],
  } = await db.query<IntakeRow>(
    `insert into market_intakes(request_key,token,mode,amount_kopecks,method,email,marketing_consent,review_consent,client_hash,transfer_details) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) returning *`,
    [
      input.requestKey,
      randomBytes(32).toString("hex"),
      mode,
      amount,
      input.method,
      email,
      input.marketingConsent,
      input.reviewConsent ?? true,
      clientHash,
      input.method === "transfer"
        ? JSON.stringify(register.transfer_settings)
        : null,
    ],
  );
  return result;
}
export async function confirmIntake(db: MarketDb, id: string, actor: string) {
  await lockRegister(db);
  const {
    rows: [r],
  } = await db.query<IntakeRow>(
    "select * from market_intakes where id=$1 for update",
    [id],
  );
  if (!r || r.cancelled_at || r.method === "robokassa")
    throw Error("Эту покупку нельзя подтвердить вручную");
  if (r.paid_at) return;
  if (r.sale_id) throw Error("Покупка уже передана на оплату");
  await db.query(
    "update market_intakes set paid_at=now(),confirmed_by=$2 where id=$1",
    [id, actor],
  );
}
export async function finalizeIntake(
  db: MarketDb,
  id: string,
  raw: unknown,
  actor: string,
) {
  const basket = basketSchema.parse(raw);
  await lockRegister(db);
  const {
    rows: [r],
  } = await db.query<IntakeRow>(
    "select * from market_intakes where id=$1 for update",
    [id],
  );
  if (!r || r.cancelled_at) throw Error("Покупка не найдена или отменена");
  if (r.sale_id) {
    const {
      rows: [sale],
    } = await db.query<SaleRow>("select * from market_sales where id=$1", [
      r.sale_id,
    ]);
    const canonical = (b: typeof basket) =>
      JSON.stringify([
        b.gardenBundle,
        Object.entries(b.quantities)
          .filter(([, n]) => n)
          .sort(),
      ]);
    if (canonical(basket) !== canonical(sale.request_payload))
      throw Error(
        "Состав уже сохранён. Повторная выдача нового чека запрещена",
      );
    return sale;
  }
  if (r.method !== "robokassa" && !r.paid_at)
    throw Error("Сначала подтвердите получение денег");
  const quote = quoteBasket(basket, await inventory(db));
  if (Math.round(quote.amount * 100) !== r.amount_kopecks)
    throw Error("Сумма изделий должна точно совпадать с суммой покупки");
  const sale = await createSale(
    db,
    { ...basket, requestKey: r.request_key },
    r.mode,
    r.method,
    { independent: true },
  );
  if (r.method === "robokassa") {
    // The provider still creates its own receipt. Never enqueue a second NPD receipt.
    await db.query(
      "update market_sales set email=$2,marketing_consent=$3,review_consent=$4 where id=$1",
      [sale.id, r.email, r.marketing_consent, r.review_consent],
    );
  } else {
    await saveManualContact(
      db,
      sale.token,
      r.email,
      r.marketing_consent,
      r.review_consent,
    );
    await confirmManualSale(db, sale.id, actor);
    await db.query(
      "update market_sales set paid_at=$2,confirmed_by=$3 where id=$1",
      [sale.id, r.paid_at, r.confirmed_by],
    );
  }
  await db.query(
    "update market_sales set purchase_terms_version=$2,purchase_terms_accepted_at=$3 where id=$1",
    [sale.id, r.terms_version, r.created_at],
  );
  await db.query("update market_intakes set sale_id=$2 where id=$1", [
    id,
    sale.id,
  ]);
  return sale;
}
export async function cancelIntake(db: MarketDb, id: string) {
  await lockRegister(db);
  const { rows } = await db.query(
    "update market_intakes set cancelled_at=now() where id=$1 and paid_at is null and sale_id is null and cancelled_at is null returning id",
    [id],
  );
  if (!rows.length)
    throw Error(
      "Можно отменить только неоплаченную покупку без сохранённого состава",
    );
}
