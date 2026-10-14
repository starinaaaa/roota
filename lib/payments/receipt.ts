import { z } from "zod";
import type { Receipt } from "@robokassa/sdk";
import { amountInKopecks, type PaymentMode, type PaymentRow } from "./model";

const tax = z.enum([
  "none",
  "vat0",
  "vat10",
  "vat110",
  "vat20",
  "vat22",
  "vat120",
  "vat122",
  "vat5",
  "vat7",
  "vat105",
  "vat107",
]);
const fiscalItem = z
  .object({
    tax,
    // Omitted values use the active fiscal solution's defaults in Robokassa.
    payment_method: z
      .enum([
        "full_prepayment",
        "prepayment",
        "advance",
        "full_payment",
        "partial_payment",
        "credit",
        "credit_payment",
      ])
      .optional(),
    payment_object: z.string().min(1).optional(),
  })
  .strict();
const sno = z.enum([
  "osn",
  "usn_income",
  "usn_income_outcome",
  "esn",
  "patent",
]);
const profileSchema = z
  .object({
    goods: fiscalItem,
    delivery: fiscalItem,
    insurance: fiscalItem,
    sno: sno.optional(),
  })
  .strict();
export type ReceiptProfile = z.infer<typeof profileSchema>;

export function parseReceiptProfile(
  raw: string | undefined,
  mode: PaymentMode,
) {
  if (!raw) {
    if (mode === "live") throw new Error("RECEIPT_NOT_APPROVED");
    return null;
  }
  return profileSchema.parse(JSON.parse(raw));
}
const receiptSchema = z
  .object({
    sno: sno.optional(),
    items: z
      .array(
        fiscalItem.extend({
          name: z.string().trim().min(1).max(128),
          quantity: z.number().int().positive(),
          sum: z.number().finite().nonnegative(),
        }),
      )
      .min(1)
      .max(100),
  })
  .strict();

export function validateReceipt(
  receipt: unknown,
  amount: string | number,
): Receipt {
  const parsed = receiptSchema.parse(receipt);
  const expected = amountInKopecks(String(amount));
  const actual = parsed.items.reduce(
    (total, item) => total + amountInKopecks(String(item.sum)),
    BigInt(0),
  );
  if (expected <= BigInt(0) || actual !== expected)
    throw new Error("RECEIPT_AMOUNT_MISMATCH");
  return parsed;
}

export function buildReceipt(
  payment: Pick<PaymentRow, "items" | "amount">,
  profile: ReceiptProfile,
): Receipt {
  const delivery = payment.items.filter((item) => item.kind !== "goods");
  // Merge only fiscally equivalent services. Keep the original payment breakdown.
  const sameFiscal =
    profile.delivery.tax === profile.insurance.tax &&
    profile.delivery.payment_method === profile.insurance.payment_method &&
    profile.delivery.payment_object === profile.insurance.payment_object;
  const items =
    sameFiscal && delivery.length
      ? [
          ...payment.items.filter((item) => item.kind === "goods"),
          {
            kind: "delivery" as const,
            name: "Доставка",
            quantity: 1,
            sum:
              Number(
                delivery.reduce(
                  (sum, item) => sum + amountInKopecks(String(item.sum)),
                  BigInt(0),
                ),
              ) / 100,
          },
        ]
      : payment.items;
  const receipt = {
    ...(profile.sno ? { sno: profile.sno } : {}),
    items: items.map((item) => ({
      name:
        item.kind === "goods"
          ? item.name.trim().replace(/\s+/g, " ").slice(0, 128)
          : "Доставка",
      quantity: item.quantity,
      sum: Number(item.sum),
      ...profile[item.kind],
    })),
  };
  return validateReceipt(receipt, payment.amount);
}
