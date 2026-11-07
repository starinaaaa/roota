import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import {
  basketSchema,
  quoteBasket,
  stockSchema,
  type Basket,
  type InventoryItem,
  type SaleItem,
  type SaleStatus,
  type PaymentMethod,
  type TransferSettings,
  newItemSchema,
  validReceiptUrl,
  type ReceiptStatus,
} from "./model";
import type { PaymentRow } from "../payments/model";

// All mutating calls run inside transaction(), taking the register lock first.
export type MarketDb = Pick<PoolClient, "query">;
export type SaleRow = {
  id: string;
  inv_id: string;
  request_key: string;
  request_payload: Basket;
  token: string;
  mode: "test" | "live";
  payment_method: PaymentMethod;
  transfer_details: TransferSettings | null;
  receipt_url: string | null;
  receipt_state?: ReceiptStatus;
  receipt_registered_at?: Date | null;
  receipt_verified_at?: Date | null;
  status: SaleStatus;
  amount: string;
  items: SaleItem[];
  allocations: { key: string; quantity: number }[];
  reserved: boolean;
  email: string | null;
  receipt: PaymentRow["receipt"];
  created_at: Date;
  expires_at: Date;
  paid_at: Date | null;
};
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function lockRegister(db: MarketDb) {
  await db.query("select id from public.market_register where id=1 for update");
}
export async function inventory(db: MarketDb): Promise<InventoryItem[]> {
  const { rows } = await db.query<InventoryItem>(`select m.*,
    (select '/media/'||p.id||'/'||i.id from public.product_images i where i.product_id=p.id order by i.is_primary desc,i.sort_order limit 1) image
    from public.market_inventory m left join public.products p on p.id=m.product_id order by m.sort_order,m.key`);
  return rows;
}
async function release(
  db: MarketDb,
  sale: SaleRow,
  status: "expired" | "cancelled",
) {
  if (sale.reserved)
    for (const item of sale.allocations) {
      await db.query(
        "update public.market_inventory set stock_qty=stock_qty+$2 where key=$1",
        [item.key, item.quantity],
      );
    }
  await db.query(
    "update public.market_sales set status=$2,reserved=false where id=$1",
    [sale.id, status],
  );
}
export async function expireSales(db: MarketDb) {
  const { rows } = await db.query<SaleRow>(
    "select * from public.market_sales where status='pending' and expires_at<=now() order by id for update",
  );
  for (const sale of rows) await release(db, sale, "expired");
}
export async function createSale(
  db: MarketDb,
  raw: unknown,
  mode: "test" | "live",
  method: PaymentMethod = "robokassa",
) {
  const input = basketSchema.parse(raw);
  await lockRegister(db);
  await expireSales(db);
  const {
    rows: [existing],
  } = await db.query<SaleRow>(
    "select * from public.market_sales where request_key=$1",
    [input.requestKey],
  );
  if (existing) {
    const canonical = (b: Basket) =>
      JSON.stringify([
        b.gardenBundle,
        Object.entries(b.quantities)
          .filter(([, n]) => n)
          .sort(),
      ]);
    if (
      canonical(existing.request_payload) !== canonical(input) ||
      mode !== existing.mode ||
      method !== existing.payment_method
    )
      throw new Error("Эта покупка уже создана с другим составом");
    return existing;
  }
  const {
    rows: [active],
  } = await db.query(
    "select s.status from public.market_register r join public.market_sales s on s.id=r.current_sale_id where r.id=1",
  );
  if (active?.status === "pending")
    throw new Error("Сначала дождитесь оплаты или отмените текущую покупку");
  const priced = quoteBasket(input, await inventory(db));
  const {
    rows: [sale],
  } = await db.query<SaleRow>(
    `insert into public.market_sales(request_key,request_payload,token,mode,amount,items,allocations,reserved,payment_method,transfer_details)
    values($1,$2::jsonb,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,case when $9='transfer' then (select transfer_settings from public.market_register where id=1) end) returning *`,
    [
      input.requestKey,
      JSON.stringify(input),
      randomBytes(32).toString("hex"),
      mode,
      priced.amount,
      JSON.stringify(priced.items),
      JSON.stringify(priced.allocations),
      mode === "live",
      method,
    ],
  );
  if (mode === "live")
    for (const item of priced.allocations) {
      const result = await db.query(
        "update public.market_inventory set stock_qty=stock_qty-$2 where key=$1 and stock_qty>=$2 returning key",
        [item.key, item.quantity],
      );
      if (!result.rows.length)
        throw new Error("Остаток изменился. Проверьте покупку");
    }
  await db.query(
    "update public.market_register set current_sale_id=$1 where id=1",
    [sale.id],
  );
  return sale;
}
export async function cancelSale(db: MarketDb, id: string) {
  await lockRegister(db);
  const {
    rows: [sale],
  } = await db.query<SaleRow>(
    "select * from public.market_sales where id=$1 for update",
    [id],
  );
  if (!sale || sale.status !== "pending")
    throw new Error("Покупка уже завершена. Обновите экран");
  await release(db, sale, "cancelled");
}
export async function confirmSale(db: MarketDb, id: string) {
  await lockRegister(db);
  await expireSales(db);
  const {
    rows: [sale],
  } = await db.query<SaleRow>(
    "select * from public.market_sales where id=$1 for update",
    [id],
  );
  if (!sale || sale.payment_method !== "robokassa")
    throw new Error("MARKET_SALE_MISMATCH");
  if (sale.status === "paid" || sale.status === "paid_review") return;
  // Late payments remain visible for manual review; never re-consume released stock.
  await db.query(
    "update public.market_sales set status=$2,paid_at=now(),reserved=false where id=$1",
    [id, sale.status === "pending" ? "paid" : "paid_review"],
  );
}
export async function saveInventory(db: MarketDb, raw: unknown) {
  const { items } = stockSchema.parse(raw);
  if (new Set(items.map((i) => i.key)).size !== items.length)
    throw new Error("Повтор товара в настройках");
  await lockRegister(db);
  await expireSales(db);
  // Prevent changing prices or stock while a buyer is paying.
  const {
    rows: [pending],
  } = await db.query(
    "select id from public.market_sales where status='pending' limit 1",
  );
  if (pending)
    throw new Error("Завершите текущую покупку перед изменением остатков");
  const current = await inventory(db);
  if (items.length !== current.length)
    throw new Error("Список товаров изменился. Обновите страницу");
  for (const input of [...items].sort((a, b) => a.key.localeCompare(b.key))) {
    const item = current.find((i) => i.key === input.key);
    if (!item) throw new Error("Товар не найден");
    if (
      item.stock_qty !== input.previousStock ||
      item.price !== input.previousPrice ||
      (input.previousReceiptName !== undefined &&
        item.receipt_name !== input.previousReceiptName)
    )
      throw new Error("Остатки или цены изменились. Откройте настройки заново");
    await db.query(
      "update public.market_inventory set stock_qty=$2,price=$3,receipt_name=$4 where key=$1",
      [
        item.key,
        input.stock,
        input.price,
        input.receiptName ?? item.receipt_name,
      ],
    );
  }
}

export function paymentRow(sale: SaleRow): PaymentRow {
  return {
    ...sale,
    status: sale.paid_at ? "paid" : "pending",
    order_id: null,
    test_order_id: null,
    cart_session: "market",
    email: sale.email ?? "",
    expires_at: sale.expires_at.toISOString(),
    paid_at: sale.paid_at?.toISOString() ?? null,
  };
}

export async function addInventoryItem(db: MarketDb, raw: unknown) {
  const item = newItemSchema.parse(raw);
  await lockRegister(db);
  const {
    rows: [count],
  } = await db.query("select count(*)::int n from public.market_inventory");
  if (count.n >= 30) throw new Error("На маркете может быть до 30 позиций");
  await db.query(
    "insert into public.market_inventory(key,name,kind,price,stock_qty,sort_order,receipt_name) values($1,$2,$3,$4,$5,15,$6)",
    [
      "custom-" + randomBytes(12).toString("hex"),
      item.name,
      item.kind,
      item.price,
      item.stock,
      item.receiptName,
    ],
  );
}
export async function confirmManualSale(
  db: MarketDb,
  id: string,
  actor: string,
) {
  await lockRegister(db);
  await expireSales(db);
  const {
    rows: [sale],
  } = await db.query<SaleRow>(
    "select * from public.market_sales where id=$1 for update",
    [id],
  );
  if (!sale || !["cash", "transfer"].includes(sale.payment_method))
    throw new Error("Эту оплату подтверждает только Робокасса");
  if (sale.status === "paid") return;
  if (sale.status !== "pending")
    throw new Error("Покупка уже отменена или срок истёк. Подготовьте новую");
  await db.query(
    "update public.market_sales set status='paid',paid_at=now(),reserved=false,confirmed_by=$2 where id=$1",
    [id, actor],
  );
  await db.query(
    "insert into public.market_receipt_jobs(sale_id) values($1) on conflict do nothing",
    [id],
  );
}
export async function attachReceipt(
  db: MarketDb,
  id: string,
  proof: { url: string; registeredAt: string; verifiedAt: string },
) {
  const url = proof.url.replace(/\/$/, "");
  if (!validReceiptUrl(url))
    throw new Error(
      "Нужна ссылка на чек из Моего налога: lknpd.nalog.ru/api/v1/receipt/.../print",
    );
  await lockRegister(db);
  const {
    rows: [sale],
  } = await db.query<SaleRow>(
    "select * from public.market_sales where id=$1 for update",
    [id],
  );
  if (!sale || sale.status !== "paid" || sale.payment_method === "robokassa")
    throw new Error(
      "Чек доступен только для подтверждённой оплаты наличными или переводом",
    );
  if (sale.receipt_url && sale.receipt_url.replace(/\/$/, "") !== url)
    throw new Error(
      "К покупке уже привязан другой чек. Проверьте его перед изменением",
    );
  await db.query(
    "update public.market_sales set receipt_url=$2,receipt_added_at=coalesce(receipt_added_at,now()) where id=$1",
    [id, url],
  );
  await db.query(
    `update public.market_receipt_jobs set state='registered',
    registered_at=coalesce(registered_at,$2::timestamptz),verified_at=coalesce(verified_at,$3::timestamptz),
    last_error=null,updated_at=now() where sale_id=$1`,
    [id, proof.registeredAt, proof.verifiedAt],
  );
}

/** Record only a submitted newsletter choice; page views never subscribe anyone. */
export async function savePaymentContact(
  db: MarketDb,
  sale: SaleRow,
  email: string,
  receipt: SaleRow["receipt"],
  marketingConsent: boolean,
  reviewConsent = false,
) {
  if (sale.status !== "pending" || sale.payment_method !== "robokassa")
    throw new Error("MARKET_PAYMENT_NOT_PENDING");
  if (sale.email && sale.email !== email)
    throw new Error("MARKET_EMAIL_MISMATCH");
  const version = "market-email-2026-11-07";
  await db.query(
    `update public.market_sales set email=$2,receipt=$3::jsonb,
      marketing_consent=$4,
      marketing_consent_at=case when $4 then coalesce(marketing_consent_at,now()) else null end,
      marketing_consent_version=case when $4 then $5 else null end where id=$1`,
    [sale.id, email, JSON.stringify(receipt), marketingConsent, version],
  );
  await saveReviewContact(db, sale, email, reviewConsent);
  // A test purchase never creates a real marketing subscription.
  if (sale.mode !== "live") return;
  const resource = `market:${sale.id}`;
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    email,
  ]);
  if (marketingConsent) {
    await db.query("select public.record_checkout_news_consent($1,$2,$3,$4)", [
      email,
      resource,
      randomBytes(32).toString("hex"),
      version,
    ]);
  } else {
    await db.query(
      `update public.email_subscriptions set revoked_at=now()
      where email=$1 and resource=$2 and purpose='news' and revoked_at is null`,
      [email, resource],
    );
    await db.query(
      `update public.email_messages m set state='cancelled',last_error='Настройки рассылки на маркете изменены'
      from public.email_subscriptions s where m.subscription_id=s.id and s.resource=$1
      and s.purpose='news' and s.revoked_at is not null and m.state='pending'`,
      [resource],
    );
  }
}

/** Receipt email and optional invitations are independent of fiscal registration. */
export async function saveReviewContact(
  db: MarketDb,
  sale: SaleRow,
  email: string,
  consent: boolean,
) {
  const version = "market-review-email-2026-11-07";
  await db.query(
    `update public.market_sales set review_consent=$2,
    review_consent_at=case when $2 then coalesce(review_consent_at,now()) else null end,
    review_consent_version=case when $2 then $3 else null end where id=$1`,
    [sale.id, consent, version],
  );
  if (sale.mode !== "live") return;
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    email,
  ]);
  const resource = `market:${sale.id}`;
  if (consent) {
    await db.query(
      `insert into public.email_subscriptions(email,purpose,resource,token,confirmed_at,direct_consent_at,consent_version)
      values($1,'review',$2,$3,now(),now(),$4) on conflict(email,purpose,resource) do update
      set revoked_at=null,confirmed_at=now(),direct_consent_at=now(),consent_version=excluded.consent_version`,
      [email, resource, randomBytes(32).toString("hex"), version],
    );
  } else {
    await db.query(
      "update public.email_subscriptions set revoked_at=now() where email=$1 and purpose='review' and resource=$2 and revoked_at is null",
      [email, resource],
    );
    await db.query(
      "update public.email_messages set state='cancelled',last_error='Покупатель отказался от приглашения' where kind='review_invite' and payload->>'market_sale_id'=$1 and state='pending'",
      [sale.id],
    );
  }
}
export async function saveManualContact(
  db: MarketDb,
  token: string,
  email: string,
  marketingConsent: boolean,
  reviewConsent: boolean,
) {
  await lockRegister(db);
  const {
    rows: [sale],
  } = await db.query<SaleRow>(
    "select * from public.market_sales where token=$1 for update",
    [token],
  );
  if (
    !sale ||
    sale.payment_method === "robokassa" ||
    !["pending", "paid"].includes(sale.status)
  )
    throw new Error("Покупка уже закрыта. Обратитесь к продавцу");
  if (sale.email && sale.email !== email)
    throw new Error(
      "Для этой покупки уже сохранена другая почта. Обратитесь к продавцу",
    );
  await db.query(
    `update public.market_sales set email=$2,marketing_consent=$3,
    marketing_consent_at=case when $3 then coalesce(marketing_consent_at,now()) else null end,
    marketing_consent_version=case when $3 then 'market-email-2026-11-07' else null end where id=$1`,
    [sale.id, email, marketingConsent],
  );
  await saveReviewContact(db, sale, email, reviewConsent);
  if (sale.mode === "live") {
    if (marketingConsent)
      await db.query(
        "select public.record_checkout_news_consent($1,$2,$3,$4)",
        [
          email,
          `market:${sale.id}`,
          randomBytes(32).toString("hex"),
          "market-email-2026-11-07",
        ],
      );
    else
      await db.query(
        "update public.email_subscriptions set revoked_at=now() where email=$1 and purpose='news' and resource=$2 and revoked_at is null",
        [email, `market:${sale.id}`],
      );
  }
}
