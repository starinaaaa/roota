import type { InvoiceItem, Receipt } from "@robokassa/sdk";
import { amountInKopecks } from "./model";

// Full refunds reuse the original fiscal snapshot, including delivery.
export function refundItems(
  receipt: Receipt | null,
  amount: string,
): InvoiceItem[] {
  if (!receipt?.items.length) throw new Error("REFUND_RECEIPT_REQUIRED");
  const items = receipt.items.map((item) => {
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      !item.name ||
      !item.tax
    )
      throw new Error("INVALID_REFUND_RECEIPT");
    return {
      Name: item.name,
      Quantity: item.quantity,
      Cost: Number(item.sum),
      Tax: item.tax,
      ...(item.payment_method ? { PaymentMethod: item.payment_method } : {}),
      ...(item.payment_object ? { PaymentObject: item.payment_object } : {}),
    };
  });
  if (
    items.some((i) => !Number.isFinite(i.Cost) || i.Cost < 0) ||
    items.reduce(
      (sum, i) => sum + amountInKopecks(String(i.Cost)),
      BigInt(0),
    ) !== amountInKopecks(amount)
  )
    throw new Error("INVALID_REFUND_RECEIPT");
  return items;
}
export function verifiedRefundState(
  result: { requestId: string; amount: number; label: string },
  requestId: string,
  amount: string,
) {
  if (
    result.requestId.toLowerCase() !== requestId.toLowerCase() ||
    amountInKopecks(String(result.amount)) !== amountInKopecks(amount) ||
    !["finished", "processing", "canceled"].includes(result.label)
  )
    throw new Error("REFUND_STATE_MISMATCH");
  return result.label as "finished" | "processing" | "canceled";
}
