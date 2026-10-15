import "server-only";
import { parseReceiptProfile, validateReceipt } from "./receipt";
import {
  paymentExpired,
  sdkFor,
  type PaymentMode,
  type PaymentRow,
} from "./model";
import { createServerClient } from "@/lib/db";
import { cookies } from "next/headers";
import { uuid } from "@/lib/validation";

export function paymentMode(): PaymentMode | null {
  const mode = process.env.ROBOKASSA_MODE;
  if (!mode || mode === "off") return null;
  if (mode !== "test" && mode !== "live") throw new Error("PAYMENT_CONFIG");
  if (
    mode === "live" &&
    (process.env.APP_ENV !== "production" ||
      process.env.VERCEL_ENV === "preview" ||
      process.env.ROBOKASSA_LIVE_ENABLED !== "true" ||
      process.env.ROBOKASSA_SMZ_READY !== "true")
  )
    throw new Error("PAYMENT_CONFIG");
  sdkFor(mode);
  return mode;
}

export function receiptProfile(mode: PaymentMode) {
  return parseReceiptProfile(process.env.ROBOKASSA_RECEIPT_PROFILE, mode);
}

export async function ownedPayment(id: string): Promise<PaymentRow | null> {
  const session = (await cookies()).get("cart_session")?.value;
  if (!uuid.safeParse(id).success || !uuid.safeParse(session).success)
    return null;
  const db = createServerClient();
  const { error: expiryError } = await db.rpc("release_expired_reservations");
  if (expiryError) throw new Error("PAYMENT_DATABASE");
  const { data, error } = await db
    .from("payments")
    .select("*")
    .eq("id", id)
    .eq("cart_session", session)
    .maybeSingle();
  if (error) throw new Error("PAYMENT_DATABASE");
  if (data?.order_id && data.status === "paid") {
    const { data: order, error: orderError } = await db
      .from("orders")
      .select("status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (orderError) throw new Error("PAYMENT_DATABASE");
    data.requires_review = order?.status === "cancelled";
  }
  return data as PaymentRow | null;
}

export function publicPaymentStatus(payment: PaymentRow) {
  return {
    id: payment.id,
    mode: payment.mode,
    status: payment.status,
    paidAt: payment.paid_at,
    expired: paymentExpired(payment),
    requiresReview: payment.requires_review ?? false,
  };
}

export function buildForm(
  payment: PaymentRow,
  baseUrl: string,
  orderNumber: string,
  orderReturnPath?: string,
) {
  if (paymentExpired(payment)) throw new Error("PAYMENT_EXPIRED");
  if (payment.mode === "live") validateReceipt(payment.receipt, payment.amount);
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost")
    throw new Error("PAYMENT_CONFIG");
  if (orderReturnPath && !/^\/order\/[a-f0-9]{64}$/.test(orderReturnPath))
    throw new Error("PAYMENT_CONFIG");
  return sdkFor(payment.mode).payment.buildPaymentForm({
    OutSum: Number(payment.amount).toFixed(2),
    InvID: String(payment.inv_id),
    Description: `Roota заказ ${orderNumber}`,
    Culture: "ru",
    Email: payment.email,
    Receipt: payment.receipt ?? undefined,
    ShpFields: { Shp_mode: payment.mode, Shp_payment: payment.id },
    SuccessURL2: `${base.origin}${orderReturnPath || "/payment/success"}`,
    SuccessURL2Method: "GET",
    FailURL2: `${base.origin}${orderReturnPath || "/payment/fail"}`,
    FailURL2Method: "GET",
  });
}

// Read the same public order number used on the order page and in customer emails.
// Robokassa's numeric invoice is kept only as the provider's payment identifier.
export async function orderNumberForPayment(
  payment: Pick<PaymentRow, "mode" | "order_id" | "inv_id">,
): Promise<string> {
  if (payment.mode === "test") return `ТЕСТ-${payment.inv_id}`;
  if (!payment.order_id) throw new Error("PAYMENT_ORDER_MISSING");
  const { data, error } = await createServerClient()
    .from("orders")
    .select("order_number")
    .eq("id", payment.order_id)
    .single();
  if (error || !data?.order_number) throw new Error("PAYMENT_ORDER_MISSING");
  return String(data.order_number);
}
