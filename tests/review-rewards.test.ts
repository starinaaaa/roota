import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  reviewCopy,
  reviewTelegramUrl,
  REVIEW_REWARD_TERMS,
} from "../lib/review-copy";
import { renderEmail } from "../lib/email/templates";
import { buildReceipt } from "../lib/payments/receipt";
import {
  renderEmailPreview,
  reviewPreviewVariants,
} from "../lib/email/preview";
import type { PaymentRow } from "../lib/payments/model";

test("admin previews render every review variant and coupon terms without empty placeholders", () => {
  const subjects = reviewPreviewVariants.map((v) => {
    const preview = renderEmailPreview(
      {
        kind: "review_invite",
        subject: "{{review_subject}}",
        body: "{{review_body}}",
      },
      v.id,
    );
    assert.match(preview.plaintext, /На доставку скидка не распространяется/);
    assert.match(preview.html, /Написать отзыв в Telegram/);
    assert.doesNotMatch(preview.html, /\{\{/);
    return preview.subject;
  });
  assert.equal(new Set(subjects).size, 4);
  const reward = renderEmailPreview({
    kind: "order_review_reward",
    subject: "Спасибо за отзыв — ваша скидка 10%",
    body: "Ваш промокод: {{promo_code}}. Скидка 10% на изделия до {{promo_expires}}. Доставка оплачивается полностью.",
  });
  assert.match(reward.plaintext, /ROOTA-0123456789AB/);
  assert.match(reward.plaintext, /Доставка оплачивается полностью/);
  assert.doesNotMatch(reward.html, /Подтверждение покупки|Состав заказа/);
});

test("review copy follows garden, plate quantity and mixed contents; both feedback routes are rendered", () => {
  assert.match(
    reviewCopy([
      { product_name: "Сад", quantity: 1, configuration: { size: 6 } },
    ]).subject,
    /Сад/,
  );
  assert.match(
    reviewCopy([{ product_name: "Тарелка «Солнце»", quantity: 1 }]).subject,
    /ваша тарелочка/,
  );
  assert.match(
    reviewCopy([{ product_name: "Тарелка «Солнце»", quantity: 2 }]).subject,
    /ваши тарелочки/,
  );
  assert.match(
    reviewCopy([
      { product_name: "Тарелка", quantity: 1 },
      { product_name: "Тарелка", quantity: 1 },
    ]).subject,
    /ваши тарелочки/,
  );
  assert.match(
    reviewCopy([
      { product_name: "Тарелка", quantity: 1 },
      { product_name: "Сад", quantity: 1 },
    ]).subject,
    /изделия/,
  );
  assert.match(reviewCopy([]).subject, /изделия/);
  const telegram = reviewTelegramUrl("https://t.me/studio", "GL-TEST");
  assert.equal(
    new URL(telegram).searchParams.get("text"),
    "Здравствуйте! Хочу оставить отзыв о заказе GL-TEST: ",
  );
  assert.throws(() => reviewTelegramUrl("javascript:alert(1)", "GL"));
  const email = renderEmail(
    { subject: "{{review_subject}}", body: "{{review_body}}" },
    {
      review_subject: reviewCopy([{ product_name: "Тарелка", quantity: 2 }])
        .subject,
      review_body: REVIEW_REWARD_TERMS,
    },
    "https://example.invalid/review/token",
    "Оставить отзыв",
    undefined,
    false,
    undefined,
    undefined,
    { url: telegram, label: "Написать отзыв в Telegram" },
  );
  assert.match(email.html, /ваши тарелочки/);
  assert.match(email.html, /https:\/\/t.me\/studio/);
  assert.match(email.plaintext, /Telegram/);
  assert.match(email.plaintext, /30 дней/);
});

test("review rewards: issuance, phone binding, real checkout totals, fiscal items, reservation and expiry", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/schema.sql", "utf8"));
    await db.exec("create role roota_app; create role anon;");
    await db.exec(
      await readFile("database/migrations/20261025_garden.sql", "utf8"),
    );
    await db.exec(`insert into email_settings(id,enabled,marketing_enabled,test_mode) values(1,true,true,false);
      insert into email_templates(kind,subject,body) values('order_created','Заказ','Заказ'),('order_paid','Оплата','Оплата'),('order_shipped','Отправлен','Отправлен'),('order_delivered','Получен','Получен'),('review_invite','Отзыв','Отзыв');`);
    await db.exec(
      await readFile("database/migrations/20261029_review_rewards.sql", "utf8"),
    );
    const category = randomUUID(),
      product = randomUUID(),
      garden = randomUUID();
    await db.query(
      "insert into categories(id,slug,name) values($1,'plates','Тарелки')",
      [category],
    );
    await db.query(
      `insert into products(id,category_id,slug,name,description,price,stock_qty,publication_status,preorder_enabled,lead_time_days,configurator)
      values($1,$2,'plate','Тарелка','Описание',101,100,'published',true,21,null),($3,$2,'sad','Сад','Описание',2000,0,'published',true,21,'garden')`,
      [product, category, garden],
    );
    const form = {
      name: "Тест Покупатель",
      phone: "+79990000000",
      email: "reward@example.invalid",
      deliveryType: "moscow",
      deliveryMethod: "yandex_courier",
      telegram: "test_buyer",
      address: "Москва, тестовый адрес",
      comment: "",
      reviewConsent: true,
    };
    async function source(method = "telegram") {
      const id = randomUUID(),
        token = randomBytes(32).toString("hex");
      await db.query(
        "insert into orders(id,customer_name,customer_phone,customer_email,total_amount,delivery_type,payment_status,status,delivery_stage,request_payload) values($1,'Покупатель',$2,$3,1000,'russia','paid','delivered','delivered',$4)",
        [id, form.phone, form.email, { form }],
      );
      await db.query("insert into order_access(order_id,token) values($1,$2)", [
        id,
        token,
      ]);
      if (method === "website")
        await db.query(
          "select submit_customer_review($1,1,'Честный отрицательный отзыв',array[]::text[],false)",
          [token],
        );
      else await db.query("select issue_review_reward($1,'telegram')", [id]);
      return {
        id,
        token,
        ...(
          await db.query<{ code: string }>(
            "select code from review_rewards where source_order_id=$1",
            [id],
          )
        ).rows[0],
      };
    }
    async function cart(withGarden = false) {
      const session = randomUUID();
      await db.query("select mutate_cart($1,$2,3,'add','stock')", [
        session,
        product,
      ]);
      if (withGarden)
        await db.query(
          'select mutate_garden_cart($1,$2,\'{"size":6,"stems":3,"flowers":2,"leaves":1}\'::jsonb,$3,\'add\')',
          [session, garden, randomUUID()],
        );
      return session;
    }
    const checkout = async (
      session: string,
      code: string,
      total = 272.7,
      mode = "live",
      key = randomUUID(),
      overrides: object = {},
      quote: string | null = null,
    ) =>
      (
        await db.query<{ r: PaymentRow & { number: string } }>(
          "select checkout_reward_order($1,$2,$3,$4,$5,$6) r",
          [
            session,
            key,
            { ...form, promoCode: code, ...overrides },
            total,
            quote,
            mode,
          ],
        )
      ).rows[0].r;
    await t.test(
      "negative private website review earns exactly one reward, independently of publication and photo",
      async () => {
        const s = await source("website");
        assert.match(s.code, /^ROOTA-[A-F0-9]{12}$/);
        await db.query(
          "select submit_customer_review($1,5,'Повторный отзыв',array[]::text[],true)",
          [s.token],
        );
        await db.query("select issue_review_reward($1,'telegram')", [s.id]);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from review_rewards where source_order_id=$1",
              [s.id],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from email_messages where order_id=$1 and kind='order_review_reward'",
              [s.id],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query<{ ok: boolean }>(
              "select expires_at-issued_at=interval '30 days' ok from review_rewards where source_order_id=$1",
              [s.id],
            )
          ).rows[0].ok,
          true,
        );
        await db.query(
          "update orders set delivery_stage='in_transit' where id=$1",
          [s.id],
        );
        await assert.rejects(
          db.query("select issue_review_reward($1,'telegram')", [s.id]),
          /ORDER_UNAVAILABLE/,
        );
      },
    );
    await t.test(
      "unknown code, wrong phone, false total and expired code cannot create orders or reserve a reward",
      async () => {
        const s = await source(),
          session = await cart();
        await assert.rejects(
          checkout(session, "ROOTA-000000000000"),
          /PROMO_INVALID/,
        );
        await assert.rejects(
          checkout(session, s.code, 272.7, "live", randomUUID(), {
            phone: "+79991111111",
          }),
          /PROMO_INVALID/,
        );
        await assert.rejects(checkout(session, s.code, 270.7), /PRICE_CHANGED/);
        assert.equal(
          (
            await db.query<{ reserved_order_id: string | null }>(
              "select reserved_order_id from review_rewards where source_order_id=$1",
              [s.id],
            )
          ).rows[0].reserved_order_id,
          null,
        );
        await db.query(
          "update review_rewards set expires_at=now()-interval '1 second' where source_order_id=$1",
          [s.id],
        );
        await assert.rejects(checkout(session, s.code), /PROMO_EXPIRED/);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from orders where cart_session=$1",
              [session],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "courier payment and fiscal receipt get 10% off goods; committed retries return the same payment",
      async () => {
        const s = await source(),
          session = await cart(),
          key = randomUUID();
        const p = await checkout(session, s.code, 272.7, "live", key);
        assert.equal(Number(p.amount), 272.7);
        assert.equal(Number(p.items[0].sum), 272.7);
        const receipt = buildReceipt(p, {
          goods: { tax: "none" },
          delivery: { tax: "none" },
          insurance: { tax: "none" },
        });
        assert.equal(receipt.items[0].sum, 272.7);
        assert.equal(
          (await checkout(session, s.code, 272.7, "live", key)).id,
          p.id,
        );
        await assert.rejects(
          checkout(session, s.code, 272.7, "live", key, { comment: "Изменён" }),
          /KEY_REUSED/,
        );
        const order = (
          await db.query<{
            total_amount: string;
            discount_amount: string;
            price: number;
          }>(
            "select o.total_amount,o.discount_amount,i.price from orders o join order_items i on i.order_id=o.id where o.id=$1",
            [p.order_id],
          )
        ).rows[0];
        assert.equal(Number(order.discount_amount), 30.3);
        assert.equal(order.price, 101);
        await assert.rejects(checkout(await cart(), s.code), /PROMO_RESERVED/);
        await db.query("select confirm_robokassa($1,$2,$3,'live')", [
          p.id,
          p.inv_id,
          p.amount,
        ]);
        await assert.rejects(checkout(await cart(), s.code), /PROMO_USED/);
      },
    );
    await t.test(
      "an unpaid cancellation releases the code without extending its expiry",
      async () => {
        const s = await source(),
          session = await cart();
        const p = await checkout(session, s.code);
        const before = (
          await db.query<{ expires_at: string }>(
            "select expires_at::text from review_rewards where source_order_id=$1",
            [s.id],
          )
        ).rows[0].expires_at;
        await db.query("update orders set status='cancelled' where id=$1", [
          p.order_id,
        ]);
        const second = await checkout(await cart(), s.code);
        assert.notEqual(second.id, p.id);
        assert.equal(
          (
            await db.query<{ expires_at: string }>(
              "select expires_at::text from review_rewards where source_order_id=$1",
              [s.id],
            )
          ).rows[0].expires_at,
          before,
        );
      },
    );
    await t.test(
      "Ozon and test-mode snapshots preserve full delivery and insurance; garden prices are discounted correctly",
      async () => {
        const s = await source(),
          session = await cart(true);
        const goods = 2303,
          net = 2072.7;
        const rule = (
          await db.query<{
            id: string;
            updated_at: string;
          }>(`insert into delivery_packing_rules(name,composition,weight_g,length_mm,width_mm,height_mm)
        values('Упаковка','[{"category_id":"${category}","quantity":1}]',1000,150,150,150) returning id,updated_at`)
        ).rows[0];
        const snapshot = (
          await db.query<{ s: unknown }>(
            `select jsonb_agg(cart_line_snapshot(p,ci) order by p.id,ci.id) s from cart_items ci join products p on p.id=ci.product_id join carts c on c.id=ci.cart_id where c.session_id=$1`,
            [session],
          )
        ).rows[0].s;
        const quote = randomUUID();
        await db.query(
          `insert into delivery_quotes(id,cart_session,phone,city,point,packing_rule_id,packing_updated_at,packing,cart_snapshot,shipment_method_id,goods_amount,delivery_amount,insurance_amount,checked_at,expires_at)
        values($1,$2,$3,'Москва','{"id":1,"address":"Москва, тестовый ПВЗ"}',$4,$5,'{}',$6,1,$7,100,20,now(),now()+interval '10 minutes')`,
          [
            quote,
            session,
            form.phone,
            rule.id,
            rule.updated_at,
            JSON.stringify(snapshot),
            goods,
          ],
        );
        const overrides = {
          deliveryMethod: "ozon_point",
          deliveryType: "russia",
        };
        const key = randomUUID();
        const testPay = await checkout(
          session,
          s.code,
          net + 120,
          "test",
          key,
          overrides,
          quote,
        );
        assert.equal(Number(testPay.amount), net + 120);
        assert.equal(
          Number(testPay.items.find((i) => i.kind === "delivery")?.sum),
          100,
        );
        assert.equal(
          Number(testPay.items.find((i) => i.kind === "insurance")?.sum),
          20,
        );
        assert.equal(
          (
            await checkout(
              session,
              s.code,
              net + 120,
              "test",
              key,
              overrides,
              quote,
            )
          ).id,
          testPay.id,
        );
        assert.equal(
          (
            await db.query<{ reserved_order_id: string | null }>(
              "select reserved_order_id from review_rewards where source_order_id=$1",
              [s.id],
            )
          ).rows[0].reserved_order_id,
          null,
        );
        const live = await checkout(
          session,
          s.code,
          net + 120,
          "live",
          randomUUID(),
          overrides,
          quote,
        );
        assert.equal(Number(live.amount), net + 120);
        const receipt = buildReceipt(live, {
          goods: { tax: "none" },
          delivery: { tax: "none" },
          insurance: { tax: "none" },
        });
        assert.equal(
          receipt.items.reduce((n, i) => n + Math.round(i.sum * 100), 0),
          Math.round((net + 120) * 100),
        );
        assert.equal(
          receipt.items.find((i) => i.name === "Доставка")?.sum,
          120,
        );
      },
    );
    await t.test(
      "source refunds revoke the reward and new invitations wait five days after complete delivery",
      async () => {
        const s = await source();
        await db.query(
          "update orders set payment_status='refunded' where id=$1",
          [s.id],
        );
        await assert.rejects(checkout(await cart(), s.code), /PROMO_EXPIRED/);
        const other = await source();
        await db.query(
          "update orders set delivery_stage='in_transit' where id=$1",
          [other.id],
        );
        await db.query(
          "update orders set delivery_stage='delivered' where id=$1",
          [other.id],
        );
        const invite = (
          await db.query<{ ok: boolean }>(
            "select scheduled_at>=created_at+interval '120 hours' ok from email_messages where order_id=$1 and kind='review_invite'",
            [other.id],
          )
        ).rows[0];
        assert.equal(invite?.ok, true);
        await db.query("select * from claim_email_messages(20)");
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from email_messages where order_id=$1 and kind='review_invite' and state='sending'",
              [other.id],
            )
          ).rows[0].n,
          0,
        );
        const denied = (
          await db.query<{ ok: boolean }>(
            "select has_table_privilege('anon','review_rewards','select') ok",
          )
        ).rows[0].ok;
        assert.equal(denied, false);
      },
    );
  } finally {
    await db.close();
  }
});
