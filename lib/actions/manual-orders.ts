"use server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { transaction, getPool } from "@/lib/db/pool";
import { gardenName, gardenSummary } from "@/lib/garden";
import { manualDraftSchema } from "@/lib/manual-orders";
import { phone } from "@/lib/validation";
import {
  courierContactFields,
  validCourierContact,
} from "@/lib/courier-contact";
import { LEGAL_VERSION } from "@/lib/legal";
import { siteUrl } from "@/lib/seo";
import { paymentMode, receiptProfile } from "@/lib/payments/robokassa";
import { buildReceipt } from "@/lib/payments/receipt";
import { ensureOrderLink } from "@/lib/order-access";
import { sendOrderNotification } from "@/lib/notifications";
import { processEmailQueue } from "@/lib/email/queue";
export async function createManualDraft(input: unknown) {
  await requireAdmin();
  try {
    const d = manualDraftSchema.parse(input);
    d.phone = phone.parse(d.phone);
    const token = randomBytes(32).toString("hex");
    await transaction(async (db) => {
      const ids = d.items.map((i) => i.product_id).filter(Boolean);
      const { rows: products } = await db.query(
        "select id,name,slug,configurator,preorder_enabled,publication_status from public.products where id=any($1::uuid[])",
        [ids],
      );
      const items = d.items.map((i) => {
        const p = products.find((p) => p.id === i.product_id);
        if (i.product_id && (!p || p.publication_status !== "published"))
          throw new Error("Одно из изделий недоступно");
        if (p?.configurator === "garden" && !i.configuration)
          throw new Error("Укажите состав Сада");
        if (p?.configurator !== "garden" && i.configuration)
          throw new Error("Состав доступен только для Сада");
        if (p && i.mode === "preorder" && !p.preorder_enabled)
          throw new Error("Предзаказ этого изделия отключён");
        return {
          ...i,
          name:
            p?.configurator === "garden" && i.configuration
              ? `${p.name} — ${gardenName(i.configuration)} (${gardenSummary(i.configuration)})`
              : (p?.name ?? i.name),
          slug: p?.slug ?? null,
        };
      });
      await db.query(
        "insert into public.manual_order_drafts(token,customer_name,email,phone,items,delivery_method,delivery_address,delivery_amount,comment) values($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)",
        [
          token,
          d.customer_name,
          d.email.toLowerCase(),
          d.phone,
          JSON.stringify(items),
          d.delivery_method,
          d.delivery_address,
          d.delivery_amount,
          d.comment,
        ],
      );
    });
    return { url: siteUrl(`/draft/${token}`) };
  } catch (e) {
    return {
      error:
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "Проверьте контакты, состав, цены и сроки заказа",
    };
  }
}
const confirmation = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  phone,
  ...courierContactFields,
  acceptedTerms: z.literal(true),
  legalVersion: z.literal(LEGAL_VERSION),
});
export async function confirmManualDraft(token: string, input: unknown) {
  try {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new Error("Ссылка недействительна");
    const d = confirmation.parse(input);
    if (paymentMode() !== "live")
      throw new Error("Оплата временно недоступна. Свяжитесь со студией.");
    const fiscal = receiptProfile("live");
    const {
      rows: [draft],
    } = await getPool().query(
      "select delivery_method from public.manual_order_drafts where token=$1",
      [token],
    );
    if (!draft) throw new Error("Заказ не найден");
    if (
      draft.delivery_method === "yandex_courier" &&
      !validCourierContact(d.contactChannel, d.contactValue)
    )
      throw new Error("Выберите канал связи и укажите корректный контакт");
    const {
      rows: [result],
    } = await getPool().query(
      "select public.accept_manual_order($1,$2::jsonb) payment",
      [
        token,
        JSON.stringify({
          ...d,
          email: d.email.toLowerCase(),
          newsletterDataConsent: false,
          subscribeToNews: false,
          emailConsent: true,
        }),
      ],
    );
    const pay = result.payment;
    if (!pay?.id) throw new Error("Не удалось подготовить оплату");
    if (fiscal && !pay.receipt)
      await getPool().query(
        "update public.payments set receipt=$2::jsonb where id=$1 and receipt is null and status='pending'",
        [pay.id, JSON.stringify(buildReceipt(pay, fiscal))],
      );
    after(async () => {
      try {
        await sendOrderNotification(pay.order_id);
        await processEmailQueue();
      } catch {
        console.error("manual_order_notification_failed");
      }
    });
    const orderUrl = await ensureOrderLink(pay.order_id);
    return { paymentPath: `${new URL(orderUrl).pathname}/pay` };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return {
      error:
        message === "OUT_OF_STOCK"
          ? "Наличие изменилось. Свяжитесь со студией для уточнения заказа."
          : message === "DRAFT_UNAVAILABLE"
            ? "Срок ссылки истёк. Попросите студию подготовить новый заказ."
            : /^(Оплата|Заказ не|Выберите канал|Ссылка недействительна)/.test(
                  message,
                )
              ? message
              : "Проверьте контакты и принятие условий. Если ошибка повторится, свяжитесь со студией.",
    };
  }
}
