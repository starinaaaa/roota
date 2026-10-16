"use server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import { uuid } from "@/lib/validation";
import { sdkFor, type PaymentRow, amountInKopecks } from "@/lib/payments/model";
import { refundItems, verifiedRefundState } from "@/lib/payments/refunds";
import { revalidatePath, revalidateTag } from "next/cache";

function refresh(order: string) {
  revalidateTag("catalog", { expire: 0 });
  revalidatePath(`/admin/orders/${order}`);
  revalidatePath("/admin/orders");
}
export async function saveOrderReturn(form: FormData) {
  const admin = await requireAdmin();
  const order = uuid.parse(form.get("order_id"));
  const { error } = await createServerClient().rpc("save_order_return", {
    p_order: order,
    p_goods: z
      .enum(["not_required", "expected", "received"])
      .parse(form.get("goods_state")),
    p_note: z.string().trim().min(5).max(2000).parse(form.get("notes")),
    p_actor: admin.id,
  });
  if (error) throw new Error("Не удалось сохранить возврат");
  refresh(order);
}
export async function requestOrderRefund(orderId: string) {
  const admin = await requireAdmin();
  if (process.env.APP_ENV !== "production") return { error: "Возвраты отключены в проверочном окружении." };
  if (!uuid.safeParse(orderId).success) return { error: "Заказ не найден" };
  if (!process.env.ROBOKASSA_PASSWORD3)
    return {
      error:
        "Для возврата из студии добавьте ROBOKASSA_PASSWORD3 на сервер приложения.",
    };
  const db = createServerClient();
  let attempted = false,
    claimed = false;
  try {
    const { data, error } = await db
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .eq("mode", "live")
      .eq("status", "paid")
      .single();
    if (error || !data)
      return {
        error:
          "Возврат доступен только для оплаченного рабочего платежа Robokassa.",
      };
    const p = data as PaymentRow;
    const items = refundItems(p.receipt, String(p.amount));
    const client = sdkFor("live");
    const operation = await client.webService.opState(Number(p.inv_id));
    if (
      operation.Result.Code !== 0 ||
      operation.State?.Code !== 100 ||
      !operation.Info?.OpKey ||
      amountInKopecks(operation.Info.OutSum ?? "") !==
        amountInKopecks(String(p.amount))
    )
      return {
        error:
          "Robokassa не подтвердила исходную операцию. Сверьте платёж в кабинете.",
      };
    const claim = await db.rpc("claim_order_refund", {
      p_order: orderId,
      p_actor: admin.id,
    });
    if (claim.error)
      return {
        error:
          "Сохраните причину возврата. Если он уже запрошен, обновите его статус перед повтором.",
      };
    claimed = true;
    attempted = true;
    const result = await client.refunds.create({
      OpKey: operation.Info.OpKey,
      RefundSum: Number(p.amount),
      InvoiceItems: items,
    });
    const validRequest = uuid.safeParse(result.requestId);
    const state =
      result.success && validRequest.success
        ? "processing"
        : result.success === false && !result.requestId
          ? "rejected"
          : "unknown";
    const saved = await db.rpc("set_order_refund_state", {
      p_order: orderId,
      p_state: state,
      p_request: validRequest.success ? validRequest.data : null,
    });
    if (saved.error)
      return {
        error:
          "Запрос отправлен. Проверьте возврат в Robokassa перед любыми повторными действиями.",
      };
    refresh(orderId);
    return state === "processing"
      ? {
          message:
            "Robokassa приняла заявку. Обновите статус для подтверждения возврата.",
        }
      : {
          error:
            state === "rejected"
              ? "Robokassa отклонила заявку. Сверьте причину в кабинете."
              : "Ответ не определён. Сверьте заявку в кабинете; повтор заблокирован.",
        };
  } catch {
    if (claimed)
      await db.rpc("set_order_refund_state", {
        p_order: orderId,
        p_state: attempted ? "unknown" : "rejected",
        p_request: null,
      });
    refresh(orderId);
    return {
      error: attempted
        ? "Нет подтверждения. Сверьте возврат в Robokassa; автоматически повторять его нельзя."
        : "Не удалось проверить платёж. Возврат не отправлялся.",
    };
  }
}
export async function refreshOrderRefund(orderId: string) {
  await requireAdmin();
  if (!uuid.safeParse(orderId).success)
    return { error: "Проверьте номер заявки" };
  const db = createServerClient();
  const { data: r, error } = await db
    .from("order_returns")
    .select("*")
    .eq("order_id", orderId)
    .single();
  if (error || !r) return { error: "Сначала сохраните возврат" };
  const id = r.provider_request_id;
  if (!id) return { error: "Укажите ID заявки Robokassa для сверки" };
  try {
    const state = verifiedRefundState(
      await sdkFor("live").refunds.getState(id),
      id,
      String(r.amount),
    );
    const saved = await db.rpc("set_order_refund_state", {
      p_order: orderId,
      p_state: state,
      p_request: id,
    });
    if (saved.error) throw new Error("SAVE");
    refresh(orderId);
    return {
      message:
        state === "finished"
          ? "Возврат денег подтверждён Robokassa"
          : state === "canceled"
            ? "Заявка отменена в Robokassa"
            : "Возврат ещё обрабатывается",
    };
  } catch {
    return {
      error: "Не удалось подтвердить статус. Данные возврата не изменены.",
    };
  }
}

export async function reconcileOrderRefund(form: FormData) {
  const admin = await requireAdmin();
  const orderId = uuid.parse(form.get("order_id"));
  const requestId = uuid.parse(form.get("request_id"));
  const note = z.string().trim().min(5).max(2000).parse(form.get("note"));
  if (form.get("verified") !== "on")
    return {
      error: "Сверьте принадлежность заявки заказу в кабинете Robokassa",
    };
  const db = createServerClient();
  const { data: r, error } = await db
    .from("order_returns")
    .select("amount")
    .eq("order_id", orderId)
    .single();
  if (error || !r) return { error: "Сначала сохраните возврат" };
  try {
    // GetState does not return an invoice ID. The admin explicitly attests the
    // order association; the provider independently confirms ID, sum and status.
    verifiedRefundState(
      await sdkFor("live").refunds.getState(requestId),
      requestId,
      String(r.amount),
    );
    const attached = await db.rpc("attach_order_refund", {
      p_order: orderId,
      p_request: requestId,
      p_actor: admin.id,
      p_note: note,
    });
    if (attached.error)
      return {
        error:
          "Не удалось связать заявку. Проверьте, не привязана ли она к другому возврату.",
      };
    return await refreshOrderRefund(orderId);
  } catch {
    return {
      error:
        "Robokassa не подтвердила заявку на полную сумму заказа. Запись не изменена.",
    };
  }
}
