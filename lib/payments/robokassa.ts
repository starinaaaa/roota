import "server-only";
import { z } from "zod";
import { sdkFor, type PaymentMode, type PaymentRow } from "./model";
import { createServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { uuid } from "@/lib/validation";

export function paymentMode(): PaymentMode | null {
  const mode = process.env.ROBOKASSA_MODE;
  if (!mode || mode === "off") return null;
  if (mode !== "test" && mode !== "live") throw new Error("PAYMENT_CONFIG");
  if (
    mode === "live" &&
    (process.env.VERCEL_ENV === "preview" ||
      process.env.ROBOKASSA_LIVE_ENABLED !== "true" ||
      process.env.ROBOKASSA_SMZ_READY !== "true")
  )
    throw new Error("PAYMENT_CONFIG");
  sdkFor(mode);
  return mode;
}

const fiscalItem = z
  .object({
    tax: z.string().min(1),
    payment_method: z.string().min(1),
    payment_object: z.string().min(1),
  })
  .strict();
const profileSchema = z
  .object({
    goods: fiscalItem,
    delivery: fiscalItem,
    insurance: fiscalItem,
    sno: z.string().min(1).optional(),
  })
  .strict();
export function receiptProfile(mode: PaymentMode) {
  const raw = process.env.ROBOKASSA_RECEIPT_PROFILE;
  if (!raw) {
    if (mode === "live") throw new Error("RECEIPT_NOT_APPROVED");
    return null; // Sandbox payment plumbing; fiscal parameters must be agreed separately.
  }
  return profileSchema.parse(JSON.parse(raw));
}

export async function ownedPayment(id: string): Promise<PaymentRow | null> {
  const session = (await cookies()).get("cart_session")?.value;
  if (!uuid.safeParse(id).success || !uuid.safeParse(session).success)
    return null;
  const { data, error } = await createServerClient()
    .from("payments")
    .select("*")
    .eq("id", id)
    .eq("cart_session", session)
    .maybeSingle();
  if (error) throw new Error("PAYMENT_DATABASE");
  return data as PaymentRow | null;
}

export function publicPaymentStatus(payment: PaymentRow) {
  return {
    id: payment.id,
    mode: payment.mode,
    status: payment.status,
    paidAt: payment.paid_at,
  };
}

export function buildForm(payment: PaymentRow, baseUrl: string) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost")
    throw new Error("PAYMENT_CONFIG");
  return sdkFor(payment.mode).payment.buildPaymentForm({
    OutSum: Number(payment.amount).toFixed(2),
    InvID: String(payment.inv_id),
    Description: `Roota заказ ${payment.inv_id}`,
    Culture: "ru",
    Email: payment.email,
    Receipt: payment.receipt ?? undefined,
    ShpFields: { Shp_mode: payment.mode, Shp_payment: payment.id },
    SuccessURL2: `${base.origin}/payment/success`,
    SuccessURL2Method: "GET",
    FailURL2: `${base.origin}/payment/fail`,
    FailURL2Method: "GET",
  });
}
