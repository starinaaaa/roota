import { z } from "zod";

export type InventoryItem = {
  key: string;
  product_id: string | null;
  name: string;
  receipt_name: string;
  kind: "plate" | "postcard" | "object" | "stems" | "flowers" | "leaves";
  price: number | null;
  stock_qty: number;
  image: string | null;
};
export const basketSchema = z
  .object({
    requestKey: z.uuid(),
    quantities: z.record(z.string().max(100), z.number().int().min(0).max(100)),
    gardenBundle: z.boolean(),
  })
  .strict()
  .refine((v) => Object.keys(v.quantities).length <= 30);
export type Basket = z.infer<typeof basketSchema>;
export type SaleItem = {
  name: string;
  quantity: number;
  sum: number;
  unitPrice?: number;
  kind: "goods";
};
export type Allocation = { key: string; quantity: number };
export type SaleStatus =
  "pending" | "paid" | "cancelled" | "expired" | "paid_review";
export type PublicSale = {
  id: string;
  number: string;
  status: SaleStatus;
  mode: "test" | "live";
  amount: number;
  items: SaleItem[];
  expiresAt: string;
  paidAt: string | null;
  paymentUrl: string | null;
  method: PaymentMethod;
  transfer: TransferSettings | null;
  receiptUrl: string | null;
  receiptStatus: ReceiptStatus;
  receiptRegisteredAt: string | null;
  qr: string | null;
};
export type MarketState = {
  inventory: InventoryItem[];
  sale: PublicSale | null;
  history: Omit<PublicSale, "paymentUrl" | "qr">[];
  displays: { id: string; lastSeenAt: string }[];
  totals: { count: number; amount: number };
  mode: "test" | "live" | null;
  manualMode: "test" | "live";
  transferSettings: TransferSettings;
  receiptQueue: PublicSale[];
  helpers: {
    id: string;
    name: string;
    status: string;
    detail: string | null;
    last_seen_at: string | null;
    revoked_at: string | null;
    operation_mode: string;
    live_enabled: boolean;
  }[];
};
export const stockSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            key: z.string().min(1).max(100),
            price: z.number().int().min(1).max(1000000).nullable(),
            stock: z.number().int().min(0).max(100000),
            previousStock: z.number().int().min(0).max(100000),
            previousPrice: z.number().int().nullable(),
            receiptName: z.string().trim().min(1).max(128).optional(),
            previousReceiptName: z.string().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();

export function quoteBasket(input: Basket, inventory: InventoryItem[]) {
  const allocations: Allocation[] = [],
    items: SaleItem[] = [];
  let gardenSubtotal = 0,
    gardenCount = 0;
  const gardenNames: string[] = [];
  for (const [key, quantity] of Object.entries(input.quantities).sort()) {
    if (!quantity) continue;
    const item = inventory.find((i) => i.key === key);
    if (!item || !item.price)
      throw new Error("Укажите цену всех выбранных товаров в настройках");
    if (quantity > item.stock_qty)
      throw new Error(`Недостаточно на маркете: ${item.name}`);
    allocations.push({ key, quantity });
    if (["stems", "flowers", "leaves"].includes(item.kind)) {
      gardenCount += quantity;
      gardenSubtotal += item.price * quantity;
      gardenNames.push(
        `${(item.receipt_name || item.name).toLowerCase()} × ${quantity}`,
      );
    } else {
      items.push({
        name: item.receipt_name || item.name,
        quantity,
        unitPrice: item.price,
        sum: item.price * quantity,
        kind: "goods",
      });
    }
  }
  if (gardenCount > 100)
    throw new Error("В одном Саду может быть до 100 деталей");
  const discount = input.gardenBundle
    ? gardenCount >= 24
      ? 10
      : gardenCount >= 16
        ? 5
        : 0
    : 0;
  if (gardenCount)
    items.push({
      name: `Сад${input.gardenBundle ? " — набор" : " — детали"}: ${gardenNames.join(", ")}`.slice(
        0,
        128,
      ),
      quantity: 1,
      sum: Math.round((gardenSubtotal * (100 - discount)) / 100),
      kind: "goods",
    });
  const amount = items.reduce((sum, i) => sum + i.sum, 0);
  if (!amount) throw new Error("Выберите хотя бы один товар");
  if (amount > 1000000) throw new Error("Сумма покупки слишком велика");
  return {
    amount,
    items: items.map((item) => ({
      ...item,
      unitPrice: item.unitPrice ?? item.sum / item.quantity,
    })),
    allocations,
    discount,
  };
}

export function money(amount: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(amount);
}
export function statusLabel(status: SaleStatus) {
  return {
    pending: "Ждём оплату",
    paid: "Оплачено",
    cancelled: "Отменено",
    expired: "Время истекло",
    paid_review: "Оплата требует проверки",
  }[status];
}

export type PaymentMethod = "robokassa" | "cash" | "transfer";
export const transferSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^\+7\d{10}$/),
    bank: z.string().trim().max(100),
    recipient: z.string().trim().min(2).max(150),
    link: z.union([
      z.literal(""),
      z
        .url()
        .max(2048)
        .refine((v) => {
          const u = new URL(v);
          return u.protocol === "https:" && !u.username && !u.password;
        }, "Используйте https-ссылку банка"),
    ]),
  })
  .strict();
export type TransferSettings = z.infer<typeof transferSchema>;
export const newItemSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    receiptName: z.string().trim().min(1).max(128),
    kind: z.enum(["plate", "postcard", "object"]),
    price: z.number().int().min(1).max(1000000),
    stock: z.number().int().min(0).max(100000),
  })
  .strict();
export type SocialLinks = {
  site: string;
  telegram: string;
  instagram: string;
  hello: string;
};
export function validReceiptUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname === "lknpd.nalog.ru" &&
      !u.username &&
      !u.password &&
      /^\/api\/v1\/receipt\/\d{12}\/[a-zA-Z0-9-]+\/print\/?$/.test(
        u.pathname,
      ) &&
      !u.hash &&
      !u.search
    );
  } catch {
    return false;
  }
}

export type ReceiptStatus =
  | "provider"
  | "not_due"
  | "queued"
  | "claimed"
  | "submitting"
  | "uncertain"
  | "failed"
  | "registered";
export function receiptStatusLabel(status: ReceiptStatus) {
  return {
    provider: "Чек через Робокассу",
    not_due: "Чек после оплаты",
    queued: "Чек ожидает выдачи",
    claimed: "Чек готовится",
    submitting: "Чек регистрируется",
    uncertain: "Результат чека требует сверки",
    failed: "Ошибка выдачи чека",
    registered: "Чек выдан",
  }[status];
}
