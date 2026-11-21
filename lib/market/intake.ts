import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  amountInKopecks,
  basketSchema,
  quoteBasket,
  marketGoodsName,
  receiptNameSchema,
  marketPaymentDate,
} from "./model";
import {
  createSale,
  inventory,
  lockRegister,
  saveManualContact,
  confirmManualSale,
  type MarketDb,
  type SaleRow,
} from "./store";

export { amountInKopecks } from "./model";
export const intakeSchema = z
  .object({
    requestKey: z.uuid(),
    amount: z.string().max(30),
    email: z.union([z.email().max(254), z.literal("")]).default(""),
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
  if (!email && input.method === "robokassa")
    throw Error("Для электронного чека Робокассы укажите почту");
  const news = !!email && input.marketingConsent;
  const review = !!email && (input.reviewConsent ?? true);
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
      previous.marketing_consent !== news ||
      previous.review_consent !== review
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
      news,
      review,
      clientHash,
      input.method === "transfer"
        ? JSON.stringify(register.transfer_settings)
        : null,
    ],
  );
  return result;
}
export async function confirmIntake(
  db: MarketDb,
  id: string,
  actor: string,
  paidDate?: string,
) {
  if (paidDate !== undefined) z.iso.date().parse(paidDate);
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
  const today = marketPaymentDate();
  if (
    paidDate &&
    (paidDate < marketPaymentDate(r.created_at) || paidDate > today)
  )
    throw Error(
      "Дата получения денег должна быть между датой покупки и сегодняшним днём",
    );
  const settledAt =
    paidDate && paidDate !== today
      ? new Date(`${paidDate}T00:00:00+03:00`)
      : null;
  await db.query(
    "update market_intakes set paid_at=coalesce($3::timestamptz,now()),confirmed_by=$2 where id=$1",
    [id, actor, settledAt],
  );
}
/** Confirmation and the receipt task commit together; a retry returns the same sale. */
export async function confirmSimpleIntake(
  db: MarketDb,
  id: string,
  actor: string,
  paidDate?: string,
) {
  await confirmIntake(db, id, actor, paidDate);
  return finalizeIntake(db, id, { generic: true }, actor);
}

export async function finalizeIntake(
  db: MarketDb,
  id: string,
  raw: unknown,
  actor: string,
) {
  const selection = z
    .union([
      z
        .object({
          generic: z.literal(true),
          name: receiptNameSchema.optional(),
        })
        .strict(),
      basketSchema,
    ])
    .parse(raw);
  const basket = "generic" in selection ? null : selection;
  const receiptName =
    "generic" in selection ? (selection.name ?? marketGoodsName) : null;
  await lockRegister(db);
  const {
    rows: [r],
  } = await db.query<IntakeRow>(
    "select * from market_intakes where id=$1 for update",
    [id],
  );
  if (!r || r.cancelled_at) throw Error("Покупка не найдена или отменена");
  if ("generic" in selection && selection.name && r.method === "robokassa")
    throw Error(
      "Название для помощника доступно только для наличных и прямых переводов",
    );
  if (r.sale_id) {
    const {
      rows: [sale],
    } = await db.query<SaleRow>("select * from market_sales where id=$1", [
      r.sale_id,
    ]);
    if (!basket) {
      if (
        !sale ||
        sale.allocations.length ||
        sale.items.length !== 1 ||
        sale.items[0].name !== receiptName
      )
        throw Error("У покупки уже сохранён другой состав");
      return sale;
    }
    const canonical = (b: NonNullable<typeof basket>) =>
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
  let sale: SaleRow;
  if (basket) {
    const quote = quoteBasket(basket, await inventory(db));
    if (Math.round(quote.amount * 100) !== r.amount_kopecks)
      throw Error("Сумма изделий должна точно совпадать с суммой покупки");
    sale = await createSale(
      db,
      { ...basket, requestKey: r.request_key },
      r.mode,
      r.method,
      { independent: true },
    );
  } else {
    sale = await insertAmountSale(
      db,
      r.request_key,
      r.mode,
      r.method,
      r.amount_kopecks / 100,
      receiptName!,
      r.transfer_details,
    );
  }
  if (r.method === "robokassa") {
    // The provider still creates its own receipt. Never enqueue a second NPD receipt.
    await db.query(
      "update market_sales set email=$2,marketing_consent=$3,review_consent=$4 where id=$1",
      [sale.id, r.email, r.marketing_consent, r.review_consent],
    );
  } else {
    if (r.email)
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

async function insertAmountSale(
  db: MarketDb,
  key: string,
  mode: IntakeRow["mode"],
  method: IntakeRow["method"],
  amount: number,
  name: string,
  transfer: unknown,
) {
  const items = [{ name, quantity: 1, sum: amount, kind: "goods" }];
  const {
    rows: [sale],
  } = await db.query<SaleRow>(
    `insert into market_sales(request_key,request_payload,token,mode,amount,items,allocations,reserved,payment_method,transfer_details)
     values($1,$2,$3,$4,$5,$6,'[]',false,$7,$8) returning *`,
    [
      key,
      JSON.stringify({ requestKey: key, quantities: {}, gardenBundle: false }),
      randomBytes(32).toString("hex"),
      mode,
      amount,
      JSON.stringify(items),
      method,
      transfer == null ? null : JSON.stringify(transfer),
    ],
  );
  return sale;
}

export async function createReceiptCheck(
  db: MarketDb,
  key: string,
  actor: { id: string; email: string },
) {
  await lockRegister(db);
  const name = "Контрольная покупка на маркете";
  const {
    rows: [previous],
  } = await db.query<SaleRow>(
    "select * from market_sales where request_key=$1",
    [key],
  );
  if (previous) {
    if (previous.email !== actor.email || previous.items[0]?.name !== name)
      throw Error("Ключ проверки уже использован");
    return previous;
  }
  const { rows: readyHelpers } = await db.query(
    `select 1 from market_receipt_helpers where revoked_at is null and live_enabled and live_all_sales and result_verified_at is not null and operation_mode='live' and status='connected' and last_seen_at > now()-interval '2 minutes'`,
  );
  if (!readyHelpers.length)
    throw Error(
      "Для проверки включите рабочий режим расширения для новых продаж и откройте ФНС.",
    );
  const sale = await insertAmountSale(db, key, "live", "cash", 1, name, null);
  await saveManualContact(db, sale.token, actor.email, false, false);
  await confirmManualSale(db, sale.id, actor.id);
  return sale;
}
