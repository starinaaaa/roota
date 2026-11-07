import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getPool, transaction } from "@/lib/db/pool";
import { paymentMode, receiptProfile } from "@/lib/payments/robokassa";
import { buildReceipt } from "@/lib/payments/receipt";
import { sdkFor, verifyPaymentNotification } from "@/lib/payments/model";
import { siteUrl } from "@/lib/seo";
import { getSiteContent } from "@/lib/site";
import type { MarketState, PublicSale, SocialLinks } from "./model";
import {
  confirmSale,
  savePaymentContact,
  expireSales,
  inventory,
  lockRegister,
  paymentRow,
  tokenHash,
  type SaleRow,
} from "./store";

export const DISPLAY_COOKIE = "roota_market_display";
export function publicSale(sale: SaleRow): PublicSale {
  return {
    id: sale.id,
    number: `М-${String(sale.inv_id).slice(-6)}`,
    status: sale.status,
    mode: sale.mode,
    method: sale.payment_method,
    transfer: sale.transfer_details,
    receiptUrl:
      sale.receipt_verified_at && sale.receipt_state === "registered"
        ? sale.receipt_url
        : null,
    receiptStatus:
      sale.payment_method === "robokassa"
        ? "provider"
        : sale.status !== "paid"
          ? "not_due"
          : (sale.receipt_state ?? "queued"),
    receiptRegisteredAt: sale.receipt_registered_at?.toISOString() ?? null,
    amount: Number(sale.amount),
    items: sale.items,
    expiresAt: sale.expires_at.toISOString(),
    paidAt: sale.paid_at?.toISOString() ?? null,
    paymentUrl:
      sale.status === "pending" ? siteUrl(`/market/pay/${sale.token}`) : null,
    qr: null,
  };
}
export function configuredMode() {
  try {
    const mode = paymentMode();
    if (mode) receiptProfile(mode);
    return mode;
  } catch {
    return null;
  }
}
export async function marketLinks(): Promise<SocialLinks> {
  const site = await getSiteContent();
  return {
    site: siteUrl(
      "/?utm_source=ceramania&utm_medium=qr&utm_campaign=november_2026",
    ),
    telegram: site.telegram,
    instagram: site.instagram,
    hello: siteUrl(
      "/market/hello?utm_source=ceramania&utm_medium=qr&utm_campaign=november_2026",
    ),
  };
}
export const manualMode = () =>
  process.env.APP_ENV === "production" ? ("live" as const) : ("test" as const);
export async function marketState(): Promise<MarketState> {
  return transaction(async (db) => {
    await lockRegister(db);
    await expireSales(db);
    const stock = await inventory(db);
    const {
      rows: [register],
    } = await db.query(
      "select transfer_settings from public.market_register where id=1",
    );
    const { rows: receiptQueue } = await db.query<SaleRow>(
      "select s.*,case when j.state='submitting' and j.lease_until<=now() then 'uncertain' else j.state end receipt_state,j.registered_at receipt_registered_at,j.verified_at receipt_verified_at from public.market_sales s left join public.market_receipt_jobs j on j.sale_id=s.id where s.status='paid' and s.payment_method<>'robokassa' and (j.state is distinct from 'registered') order by paid_at asc limit 100",
    );
    const {
      rows: [sale],
    } = await db.query<SaleRow>(
      "select s.*,case when j.state='submitting' and j.lease_until<=now() then 'uncertain' else j.state end receipt_state,j.registered_at receipt_registered_at,j.verified_at receipt_verified_at from public.market_sales s left join public.market_receipt_jobs j on j.sale_id=s.id join public.market_register r on r.current_sale_id=s.id where r.id=1",
    );
    const { rows: history } = await db.query<SaleRow>(
      "select s.*,case when j.state='submitting' and j.lease_until<=now() then 'uncertain' else j.state end receipt_state,j.registered_at receipt_registered_at,j.verified_at receipt_verified_at from public.market_sales s left join public.market_receipt_jobs j on j.sale_id=s.id order by s.created_at desc,s.id desc limit 20",
    );
    const { rows: displays } = await db.query<{
      id: string;
      last_seen_at: Date;
    }>(
      "select id,last_seen_at from public.market_displays where paired and not revoked and expires_at>now() order by created_at desc",
    );
    const {
      rows: [totals],
    } = await db.query(
      "select count(*)::int count,coalesce(sum(amount),0)::float8 amount from public.market_sales where mode='live' and status='paid'",
    );
    const { rows: helpers } = await db.query(
      "select id,name,status,detail,last_seen_at,revoked_at,operation_mode,live_enabled from public.market_receipt_helpers order by created_at desc limit 20",
    );
    return {
      helpers,
      inventory: stock,
      sale: sale ? publicSale(sale) : null,
      history: history.map((s) => {
        return { ...publicSale(s), paymentUrl: null, qr: null };
      }),
      displays: displays.map((d) => ({
        id: d.id,
        lastSeenAt: d.last_seen_at.toISOString(),
      })),
      totals,
      mode: configuredMode(),
      manualMode: manualMode(),
      transferSettings: register.transfer_settings,
      receiptQueue: receiptQueue.map(publicSale),
    };
  });
}
export async function newDisplay() {
  const previous = (await cookies()).get(DISPLAY_COOKIE)?.value;
  const token = randomBytes(32).toString("hex"),
    code = randomBytes(4).toString("hex").toUpperCase();
  await transaction(async (db) => {
    await lockRegister(db);
    if (previous && /^[a-f0-9]{64}$/.test(previous)) {
      await db.query(
        "update public.market_displays set revoked=true,pair_code=null where token_hash=$1",
        [tokenHash(previous)],
      );
    }
    const {
      rows: [count],
    } = await db.query(
      "select count(*)::int n from public.market_displays where not paired and not revoked and pair_expires_at>now()",
    );
    if (count.n >= 30)
      throw new Error(
        "Слишком много подключений. Попробуйте через несколько минут",
      );
    await db.query(
      "insert into public.market_displays(token_hash,pair_code) values($1,$2)",
      [tokenHash(token), code],
    );
  });
  (await cookies()).set(DISPLAY_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 3 * 86400,
  });
  return { code };
}
export async function connectDisplay(code: string) {
  return transaction(async (db) => {
    await lockRegister(db);
    const { rows } = await db.query(
      "update public.market_displays set paired=true,pair_code=null where pair_code=$1 and pair_expires_at>now() and not paired and not revoked and expires_at>now() returning id",
      [code.replace(/[\s-]/g, "").toUpperCase()],
    );
    if (!rows.length)
      throw new Error("Код не найден или истёк. Получите новый код на iPad");
  });
}
export async function displayState() {
  const links = await marketLinks();
  const token = (await cookies()).get(DISPLAY_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    return { connected: false, needsPairing: true, sale: null, links };
  return transaction(async (db) => {
    await lockRegister(db);
    const {
      rows: [display],
    } = await db.query(
      "select * from public.market_displays where token_hash=$1 and not revoked and expires_at>now()",
      [tokenHash(token)],
    );
    if (!display)
      return { connected: false, needsPairing: true, sale: null, links };
    if (!display.paired)
      return {
        connected: false,
        needsPairing: display.pair_expires_at <= new Date(),
        sale: null,
        links,
      };
    await db.query(
      "update public.market_displays set last_seen_at=now() where id=$1",
      [display.id],
    );
    await expireSales(db);
    const {
      rows: [sale],
    } = await db.query<SaleRow>(
      "select s.*,case when j.state='submitting' and j.lease_until<=now() then 'uncertain' else j.state end receipt_state,j.registered_at receipt_registered_at,j.verified_at receipt_verified_at from public.market_sales s left join public.market_receipt_jobs j on j.sale_id=s.id join public.market_register r on r.current_sale_id=s.id where r.id=1",
    );
    return {
      connected: true,
      needsPairing: false,
      sale: sale ? publicSale(sale) : null,
      links,
    };
  });
}
export async function saleByToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return transaction(async (db) => {
    await lockRegister(db);
    await expireSales(db);
    const {
      rows: [sale],
    } = await db.query<SaleRow>(
      "select s.*,j.state receipt_state,j.registered_at receipt_registered_at,j.verified_at receipt_verified_at,e.state receipt_email_state from public.market_sales s left join public.market_receipt_jobs j on j.sale_id=s.id left join public.email_messages e on e.event_key='market:'||s.id||':receipt' and e.recipient=s.email where s.token=$1",
      [token],
    );
    return sale ?? null;
  });
}
export async function preparePayment(
  token: string,
  email: string,
  marketingConsent = false,
  reviewConsent = false,
) {
  const mode = paymentMode();
  if (!mode)
    throw new Error("Оплата временно недоступна. Обратитесь к продавцу");
  const profile = receiptProfile(mode);
  return transaction(async (db) => {
    await lockRegister(db);
    await expireSales(db);
    const {
      rows: [sale],
    } = await db.query<SaleRow>(
      "select * from public.market_sales where token=$1 for update",
      [token],
    );
    if (
      !sale ||
      sale.status !== "pending" ||
      sale.payment_method !== "robokassa"
    )
      throw new Error(
        "Эта покупка уже завершена или отменена. Обратитесь к продавцу",
      );
    if (sale.mode !== mode)
      throw new Error("Способ оплаты изменился. Обратитесь к продавцу");
    if (sale.email && sale.email !== email)
      throw new Error(
        "Для этой покупки уже начата оплата с другим email. Обратитесь к продавцу",
      );
    const pay = paymentRow(sale);
    const receipt = profile ? buildReceipt(pay, profile) : null;
    const returnUrl = siteUrl(`/market/pay/${token}`);
    const form = sdkFor(mode).payment.buildPaymentForm({
      OutSum: Number(sale.amount).toFixed(2),
      InvID: String(sale.inv_id),
      Description: `Roota · маркет · ${publicSale(sale).number}`,
      Culture: "ru",
      Email: email,
      Receipt: receipt ?? undefined,
      ExpirationDate: sale.expires_at.toISOString(),
      ShpFields: { Shp_mode: mode, Shp_payment: sale.id, Shp_source: "market" },
      SuccessURL2: `${returnUrl}?return=success`,
      SuccessURL2Method: "GET",
      FailURL2: `${returnUrl}?return=fail`,
      FailURL2Method: "GET",
    });
    await savePaymentContact(
      db,
      sale,
      email,
      receipt,
      marketingConsent,
      reviewConsent,
    );
    return form;
  });
}
export async function confirmMarketNotification(
  fields: Record<string, string>,
) {
  const {
    rows: [sale],
  } = await getPool().query<SaleRow>(
    "select * from public.market_sales where inv_id=$1",
    [fields.InvId],
  );
  if (!sale) return false;
  verifyPaymentNotification(paymentRow(sale), fields);
  if (!sale.email) throw new Error("MARKET_PAYMENT_NOT_STARTED");
  await transaction((db) => confirmSale(db, sale.id));
  return true;
}
