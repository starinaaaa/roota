import { after, NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendOrderNotification } from "@/lib/notifications";
import {
  callbackFields,
  verifyPaymentNotification,
  type PaymentRow,
} from "@/lib/payments/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (text: string, status: number) =>
  new Response(text, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export async function POST(request: NextRequest) {
  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return reply("invalid notification", 400);
  let fields: Record<string, string>;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("EMPTY_BODY");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
    fields = callbackFields(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return reply("invalid notification", 400);
  }
  const db = createServerClient();
  const { data, error } = await db
    .from("payments")
    .select("*")
    .eq("inv_id", fields.InvId)
    .maybeSingle();
  if (error) return reply("retry later", 503);
  if (!data) return reply("invalid notification", 400);
  try {
    verifyPaymentNotification(data as PaymentRow, fields);
  } catch {
    return reply("invalid notification", 400);
  }
  const { error: saveError } = await db.rpc("confirm_robokassa", {
    p_payment: data.id,
    p_inv_id: fields.InvId,
    p_amount: String(data.amount),
    p_mode: data.mode,
  });
  if (saveError) return reply("retry later", 503);
  if (data.mode === "live" && data.order_id) {
    after(async () => {
      try {
        const { data: order } = await db
          .from("orders")
          .select("status")
          .eq("id", data.order_id)
          .maybeSingle();
        if (order && order.status !== "cancelled")
          await sendOrderNotification(data.order_id);
      } catch {
        /* The committed payment must not depend on notification delivery. */
      }
    });
  }
  return reply(`OK${fields.InvId}`, 200);
}
