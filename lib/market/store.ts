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
      item.price !== input.previousPrice
    )
      throw new Error("Остатки или цены изменились. Откройте настройки заново");
    await db.query(
      "update public.market_inventory set stock_qty=$2,price=$3 where key=$1",
      [item.key, input.stock, input.price],
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
    "insert into public.market_inventory(key,name,kind,price,stock_qty,sort_order) values($1,$2,$3,$4,$5,15)",
    [
      "custom-" + randomBytes(12).toString("hex"),
      item.name,
      item.kind,
      item.price,
      item.stock,
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
}
export async function attachReceipt(db: MarketDb, id: string, url: string) {
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
  if (sale.receipt_url && sale.receipt_url !== url)
    throw new Error(
      "К покупке уже привязан другой чек. Проверьте его перед изменением",
    );
  await db.query(
    "update public.market_sales set receipt_url=$2,receipt_added_at=now() where id=$1",
    [id, url],
  );
}
