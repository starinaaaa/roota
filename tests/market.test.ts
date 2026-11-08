import {
  amountInKopecks,
  createIntake,
  confirmIntake,
  finalizeIntake,
  cancelIntake,
} from "../lib/market/intake";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  basketSchema,
  quoteBasket,
  type InventoryItem,
  validReceiptUrl,
} from "../lib/market/model";
import {
  createSale,
  cancelSale,
  confirmSale,
  savePaymentContact,
  expireSales,
  inventory,
  lockRegister,
  saveInventory,
  paymentRow,
  addInventoryItem,
  confirmManualSale,
  attachReceipt,
  type MarketDb,
  type SaleRow,
} from "../lib/market/store";
import { buildReceipt, parseReceiptProfile } from "../lib/payments/receipt";
import { verifyPaymentNotification } from "../lib/payments/model";

const request = (quantities: Record<string, number>, gardenBundle = true) => ({
  requestKey: randomUUID(),
  quantities,
  gardenBundle,
});
async function fixture() {
  const db = new PGlite();
  await db.exec(await readFile("database/schema.sql", "utf8"));
  await db.query(
    "insert into products(slug,name,description,price,stock_qty) values('nevidimka','Невидимка','Тарелка',6000,10)",
  );
  await db.exec(
    await readFile("database/migrations/20261106_market.sql", "utf8"),
  );
  await db.exec(
    await readFile(
      "database/migrations/20261106_market_manual_payments.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "database/migrations/20261107_market_newsletter.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "database/migrations/20261107_market_receipt_jobs.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile("database/migrations/20261029_review_rewards.sql", "utf8"),
  );
  await db.exec(
    await readFile("database/migrations/20261030_website_reviews.sql", "utf8"),
  );
  await db.exec(
    await readFile("database/migrations/20261107_market_reviews.sql", "utf8"),
  );
  await db.exec(
    await readFile(
      "database/migrations/20261107_market_receipt_helper.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile("database/migrations/20261108_market_intake.sql", "utf8"),
  );
  const adapter = db as unknown as MarketDb;
  await db.exec(
    await readFile(
      "database/migrations/20261107_market_helper_activation.sql",
      "utf8",
    ),
  );
  const run = async <T>(fn: (client: MarketDb) => Promise<T>): Promise<T> => {
    await db.exec("BEGIN");
    try {
      const result = await fn(adapter);
      await db.exec("COMMIT");
      return result;
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
  };
  const settings = (await inventory(adapter)).map((i) => ({
    key: i.key,
    price: i.price ?? 200,
    stock: i.kind === "plate" ? 5 : 100,
    previousStock: i.stock_qty,
    previousPrice: i.price,
  }));
  await run((client) => saveInventory(client, { items: settings }));
  return { db, adapter, run };
}

test("market validates quantities, known items and required postcard price", () => {
  assert.equal(basketSchema.safeParse(request({ stems: -1 })).success, false);
  assert.equal(basketSchema.safeParse(request({ stems: 1.5 })).success, false);
  assert.equal(basketSchema.safeParse(request({ stems: 101 })).success, false);
  const stock = [
    { key: "postcard", price: null, stock_qty: 10, kind: "postcard" },
  ] as InventoryItem[];
  assert.throws(() => quoteBasket(request({ postcard: 1 }), stock), /цену/);
  assert.throws(() => quoteBasket(request({ unknown: 1 }), stock), /цену/);
  assert.throws(() => quoteBasket(request({}), stock), /Выберите/);
});

test("market garden follows current site thresholds, composition and individual mode", () => {
  const stock = [
    { key: "stems", price: 350, stock_qty: 100, kind: "stems", name: "Стебли" },
    {
      key: "flowers",
      price: 350,
      stock_qty: 100,
      kind: "flowers",
      name: "Цветочки",
    },
    {
      key: "leaves",
      price: 250,
      stock_qty: 100,
      kind: "leaves",
      name: "Листочки",
    },
  ] as InventoryItem[];
  assert.equal(
    quoteBasket(request({ stems: 4, flowers: 2, leaves: 2 }), stock).amount,
    2600,
  );
  assert.equal(
    quoteBasket(request({ stems: 6, flowers: 3, leaves: 3 }), stock).amount,
    3900,
  );
  assert.equal(
    quoteBasket(request({ stems: 8, flowers: 4, leaves: 4 }), stock).amount,
    4940,
  );
  assert.equal(
    quoteBasket(request({ stems: 12, flowers: 6, leaves: 6 }), stock).amount,
    7020,
  );
  assert.equal(
    quoteBasket(request({ stems: 12, flowers: 6, leaves: 6 }, false), stock)
      .amount,
    7800,
  );
  assert.throws(
    () => quoteBasket(request({ stems: 100, flowers: 1 }), stock),
    /100 деталей/,
  );
});

test("independent market stock reserves once; website stock and duplicate callbacks stay unchanged", async () => {
  const { db, adapter, run } = await fixture();
  try {
    assert.equal(
      (
        await db.query<{ stock_qty: number }>(
          "select stock_qty from products where slug='nevidimka'",
        )
      ).rows[0].stock_qty,
      10,
    );
    const basket = request({ "plate-nevidimka": 2, postcard: 1 });
    const sale = await run((client) => createSale(client, basket, "live"));
    assert.equal(Number(sale.amount), 12200);
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "plate")!.stock_qty,
      3,
    );
    const duplicate = await run((client) =>
      createSale(
        client,
        {
          ...basket,
          quantities: { postcard: 1, "plate-nevidimka": 2, leaves: 0 },
        },
        "live",
      ),
    );
    assert.equal(duplicate.id, sale.id);
    await assert.rejects(
      run((client) =>
        createSale(client, { ...basket, quantities: { postcard: 3 } }, "live"),
      ),
      /другим составом/,
    );
    await assert.rejects(
      run((client) => createSale(client, request({ postcard: 1 }), "live")),
      /текущую покупку/,
    );
    await run((client) => confirmSale(client, sale.id));
    await run((client) => confirmSale(client, sale.id));
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "plate")!.stock_qty,
      3,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from market_sales where id=$1",
          [sale.id],
        )
      ).rows[0].status,
      "paid",
    );
    await assert.rejects(
      run((client) => cancelSale(client, sale.id)),
      /завершена/,
    );
    assert.equal(
      (await db.query<{ n: number }>("select count(*)::int n from orders"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await db.query<{ n: number }>("select count(*)::int n from customers"))
        .rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("cancel/expiry return stock once; late payment is flagged and never consumes another buyer's stock", async () => {
  const { db, adapter, run } = await fixture();
  try {
    const sale = await run((client) =>
      createSale(client, request({ "plate-nevidimka": 2 }), "live"),
    );
    await run((client) => cancelSale(client, sale.id));
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "plate")!.stock_qty,
      5,
    );
    await run((client) => confirmSale(client, sale.id));
    await run((client) => confirmSale(client, sale.id));
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from market_sales where id=$1",
          [sale.id],
        )
      ).rows[0].status,
      "paid_review",
    );
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "plate")!.stock_qty,
      5,
    );
    const next = await run((client) =>
      createSale(client, request({ "plate-nevidimka": 3 }), "live"),
    );
    await db.query(
      "update market_sales set expires_at=now()-interval '1 second' where id=$1",
      [next.id],
    );
    await run(async (client) => {
      await lockRegister(client);
      await expireSales(client);
      await expireSales(client);
    });
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "plate")!.stock_qty,
      5,
    );
    await run((client) => confirmSale(client, next.id));
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from market_sales where id=$1",
          [next.id],
        )
      ).rows[0].status,
      "paid_review",
    );
  } finally {
    await db.close();
  }
});

test("test sale and callbacks leave stock unchanged", async () => {
  const { db, adapter, run } = await fixture();
  try {
    const sale = await run((client) =>
      createSale(client, request({ "plate-nevidimka": 1 }), "test"),
    );
    await run((client) => confirmSale(client, sale.id));
    assert.equal(sale.reserved, false);
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "plate")!.stock_qty,
      5,
    );
  } finally {
    await db.close();
  }
});

test("independent market quantities can exceed website stock; stale settings are rejected", async () => {
  const { db, adapter, run } = await fixture();
  try {
    const items = (await inventory(adapter)).map((i) => ({
      key: i.key,
      price: i.price,
      stock: i.stock_qty,
      previousStock: i.stock_qty,
      previousPrice: i.price,
    }));
    await run((client) =>
      saveInventory(client, {
        items: items.map((i) => ({
          ...i,
          stock: i.key === "plate-nevidimka" ? 11 : i.stock,
        })),
      }),
    );
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "plate")!.stock_qty,
      11,
    );
    assert.equal(
      (
        await db.query<{ stock_qty: number }>(
          "select stock_qty from products where slug='nevidimka'",
        )
      ).rows[0].stock_qty,
      10,
    );
    await assert.rejects(
      run((client) => saveInventory(client, { items })),
      /изменились/,
    );
    await run((client) =>
      addInventoryItem(client, {
        name: "Объект только для Ceramania",
        receiptName: "Объект только для Ceramania",
        kind: "object",
        price: 1700,
        stock: 2,
      }),
    );
    const custom = (await inventory(adapter)).find((i) => i.kind === "object")!;
    assert.equal(custom.product_id, null);
    const sale = await run((client) =>
      createSale(client, request({ [custom.key]: 1 }), "live", "cash"),
    );
    await run((client) => confirmManualSale(client, sale.id, "local-test"));
    assert.equal(
      (await inventory(adapter)).find((i) => i.key === custom.key)!.stock_qty,
      1,
    );
  } finally {
    await db.close();
  }
});

test("cash and transfer require seller confirmation, preserve snapshots, and accept only FNS receipt links", async () => {
  const { db, adapter, run } = await fixture();
  try {
    const sale = await run((client) =>
      createSale(client, request({ postcard: 1 }), "live", "transfer"),
    );
    assert.equal(sale.status, "pending");
    assert.equal(sale.transfer_details?.phone, "+79671176557");
    await assert.rejects(
      run((client) => confirmSale(client, sale.id)),
      /MISMATCH/,
    );
    await assert.rejects(
      run((client) =>
        attachReceipt(client, sale.id, {
          url: "https://lknpd.nalog.ru/api/v1/receipt/773212983545/test123/print",
          registeredAt: "2026-11-07T10:00:00Z",
          verifiedAt: "2026-11-07T10:00:01Z",
        }),
      ),
      /подтверждённой/,
    );
    await run((client) => confirmManualSale(client, sale.id, "local-test"));
    await run((client) => confirmManualSale(client, sale.id, "local-test"));
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "postcard")!.stock_qty,
      99,
    );
    await assert.rejects(
      run((client) =>
        attachReceipt(client, sale.id, {
          url: "http://127.0.0.1/receipt",
          registeredAt: "2026-11-07T10:00:00Z",
          verifiedAt: "2026-11-07T10:00:01Z",
        }),
      ),
      /ссылка/,
    );
    await run((client) =>
      attachReceipt(client, sale.id, {
        url: "https://lknpd.nalog.ru/api/v1/receipt/773212983545/test123/print",
        registeredAt: "2026-11-07T10:00:00Z",
        verifiedAt: "2026-11-07T10:00:01Z",
      }),
    );
    await assert.rejects(
      run((client) =>
        attachReceipt(client, sale.id, {
          url: "https://lknpd.nalog.ru/api/v1/receipt/773212983545/other/print",
          registeredAt: "2026-11-07T10:00:00Z",
          verifiedAt: "2026-11-07T10:00:01Z",
        }),
      ),
      /другой чек/,
    );
    assert.equal(
      validReceiptUrl(
        "https://lknpd.nalog.ru.evil.test/api/v1/receipt/773212983545/a/print",
      ),
      false,
    );
    const robo = await run((client) =>
      createSale(client, request({ postcard: 1 }), "live"),
    );
    await assert.rejects(
      run((client) => confirmManualSale(client, robo.id, "local-test")),
      /Робокасса/,
    );
  } finally {
    await db.close();
  }
});

test("market receipt matches total and signed notification rejects forged amount, id and mode", async () => {
  const { db, run } = await fixture();
  try {
    const sale = await run((client) =>
      createSale(
        client,
        request({ "plate-nevidimka": 1, stems: 8, flowers: 4, leaves: 4 }),
        "test",
      ),
    );
    const pay = paymentRow(sale as SaleRow);
    const profile = parseReceiptProfile(
      JSON.stringify({
        goods: { tax: "none" },
        delivery: { tax: "none" },
        insurance: { tax: "none" },
      }),
      "test",
    )!;
    const receipt = buildReceipt(pay, profile);
    assert.equal(
      receipt.items.reduce((n, i) => n + i.sum, 0),
      10940,
    );
    const env = {
      ROBOKASSA_HASH_ALGORITHM: "md5",
      ROBOKASSA_MERCHANT_LOGIN: "local-market",
      ROBOKASSA_TEST_PASSWORD1: "local-test-one",
      ROBOKASSA_TEST_PASSWORD2: "local-test-two",
    };
    const fields = {
      OutSum: Number(sale.amount).toFixed(6),
      InvId: String(sale.inv_id),
      Shp_mode: "test",
      Shp_payment: sale.id,
      Shp_source: "market",
      SignatureValue: "",
    };
    // Sign the exact decimal string and all custom fields, as ResultURL does.
    const { createHash } = await import("node:crypto");
    fields.SignatureValue = createHash("md5")
      .update(
        `${fields.OutSum}:${fields.InvId}:local-test-two:Shp_mode=test:Shp_payment=${sale.id}:Shp_source=market`,
      )
      .digest("hex");
    verifyPaymentNotification(pay, fields, env);
    assert.throws(() =>
      verifyPaymentNotification(pay, { ...fields, OutSum: "1.00" }, env),
    );
    assert.throws(() =>
      verifyPaymentNotification(
        pay,
        { ...fields, Shp_payment: randomUUID() },
        env,
      ),
    );
    assert.throws(() =>
      verifyPaymentNotification(pay, { ...fields, Shp_mode: "live" }, env),
    );
  } finally {
    await db.close();
  }
});

test("market newsletter records submitted choices once and isolates opt-out from other subscriptions", async () => {
  const { db, run } = await fixture();
  try {
    const sale = await run((c) =>
      createSale(c, request({ "plate-nevidimka": 1 }), "live"),
    );
    const email = "market-consent@example.test";
    await db.query("select record_checkout_news_consent($1,$2,$3,$4)", [
      email,
      "store-checkout",
      "a".repeat(64),
      "checkout-email-2026-10-23",
    ]);
    await run((c) => savePaymentContact(c, sale, email, null, false));
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions where resource like 'market:%'",
        )
      ).rows[0].n,
      0,
    );
    await run((c) => savePaymentContact(c, sale, email, null, true));
    await run((c) => savePaymentContact(c, sale, email, null, true));
    const saved = (
      await db.query<{
        marketing_consent: boolean;
        marketing_consent_at: string | null;
        marketing_consent_version: string | null;
      }>(
        "select marketing_consent,marketing_consent_at,marketing_consent_version from market_sales where id=$1",
        [sale.id],
      )
    ).rows[0];
    assert.equal(saved.marketing_consent, true);
    assert.ok(saved.marketing_consent_at);
    assert.equal(saved.marketing_consent_version, "market-email-2026-11-07");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions where resource=$1 and revoked_at is null",
          [`market:${sale.id}`],
        )
      ).rows[0].n,
      1,
    );
    await run((c) => savePaymentContact(c, sale, email, null, false));
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions where resource=$1 and revoked_at is null",
          [`market:${sale.id}`],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions where resource='store-checkout' and revoked_at is null",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("test market purchases never create marketing subscriptions", async () => {
  const { db, run } = await fixture();
  try {
    const sale = await run((c) =>
      createSale(c, request({ "plate-nevidimka": 1 }), "test"),
    );
    await run((c) =>
      savePaymentContact(c, sale, "test-choice@example.test", null, true),
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions",
        )
      ).rows[0].n,
      0,
    );
    await assert.rejects(
      run((c) =>
        savePaymentContact(
          c,
          { ...sale, email: "other@example.test" },
          "test-choice@example.test",
          null,
          true,
        ),
      ),
      /EMAIL_MISMATCH/,
    );
  } finally {
    await db.close();
  }
});

test("receipt jobs fence parallel workers, unknown submission and repeated confirmed result", async () => {
  const { claimReceiptJob, receiptJobAction } =
    await import("../lib/market/receipt-jobs");
  const { db, run, adapter } = await fixture();
  try {
    const sale = await run((c) =>
      createSale(c, request({ "plate-nevidimka": 1 }), "live", "cash"),
    );
    assert.equal(sale.items[0].name, "Керамическая тарелка «Невидимка»");
    assert.equal(sale.items[0].unitPrice, 6000);
    await run((c) => confirmManualSale(c, sale.id, "test"));
    await run((c) => confirmManualSale(c, sale.id, "test"));
    assert.equal(
      (
        await db.query<{ registered_at: Date; state: string }>(
          "select * from market_receipt_jobs",
        )
      ).rows.length,
      1,
    );
    assert.equal(
      await run((c) => claimReceiptJob(c, "test-only", "test")),
      null,
    );
    const job = (await run((c) => claimReceiptJob(c, "worker-one", "live")))!;
    assert.equal(
      await run((c) => claimReceiptJob(c, "worker-two", "live")),
      null,
    );
    await assert.rejects(
      run((c) => receiptJobAction(c, sale.id, "wrong", "submit", {})),
      /другим/,
    );
    await run((c) =>
      receiptJobAction(c, sale.id, job.claim_token, "submit", {}),
    );
    await assert.rejects(
      run((c) => receiptJobAction(c, sale.id, job.claim_token, "submit", {})),
      /уже/,
    );
    await db.query(
      "update market_receipt_jobs set lease_until=now()-interval '1 minute'",
    );
    assert.equal(
      await run((c) => claimReceiptJob(c, "worker-two", "live")),
      null,
    );
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select state from market_receipt_jobs",
        )
      ).rows[0].state,
      "uncertain",
    );
    // The original executor may deliver a late result after a lost response. No second FNS submission.
    const proof = {
      url: "https://lknpd.nalog.ru/api/v1/receipt/773212983545/fixture-only/print",
      registeredAt: "2026-11-07T10:00:00Z",
      verifiedAt: "2026-11-07T10:01:00Z",
    };
    await run((c) =>
      receiptJobAction(c, sale.id, job.claim_token, "result", { proof }),
    );
    const before = (
      await db.query<{ registered_at: Date; state: string }>(
        "select * from market_receipt_jobs",
      )
    ).rows[0];
    await run((c) =>
      receiptJobAction(c, sale.id, job.claim_token, "result", {
        proof: { ...proof, registeredAt: "2026-11-07T10:05:00Z" },
      }),
    );
    const after = (
      await db.query<{ registered_at: Date; state: string }>(
        "select * from market_receipt_jobs",
      )
    ).rows[0];
    assert.equal(String(after.registered_at), String(before.registered_at));
    assert.equal(after.state, "registered");
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "plate")!.stock_qty,
      4,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from market_sales where id=$1",
          [sale.id],
        )
      ).rows[0].status,
      "paid",
    );
    await db.query(
      "update market_inventory set receipt_name='Другое название',price=7000 where kind='plate'",
    );
    const saved = (
      await db.query<SaleRow>("select * from market_sales where id=$1", [
        sale.id,
      ])
    ).rows[0];
    assert.deepEqual(saved.items, sale.items);
  } finally {
    await db.close();
  }
});

test("expired pre-submission claims are replaced; failures never undo paid stock", async () => {
  const { claimReceiptJob, receiptJobAction } =
    await import("../lib/market/receipt-jobs");
  const { db, run, adapter } = await fixture();
  try {
    const sale = await run((c) =>
      createSale(c, request({ postcard: 2 }), "live", "transfer"),
    );
    await run((c) => confirmManualSale(c, sale.id, "test"));
    const first = (await run((c) => claimReceiptJob(c, "one", "live")))!;
    await db.query(
      "update market_receipt_jobs set lease_until=now()-interval '1 minute'",
    );
    const second = (await run((c) => claimReceiptJob(c, "two", "live")))!;
    assert.notEqual(first.claim_token, second.claim_token);
    await assert.rejects(
      run((c) => receiptJobAction(c, sale.id, first.claim_token, "submit", {})),
      /другим/,
    );
    await run((c) =>
      receiptJobAction(c, sale.id, second.claim_token, "error", {
        error: "Fixture failure before FNS",
      }),
    );
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select state from market_receipt_jobs",
        )
      ).rows[0].state,
      "failed",
    );
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "postcard")!.stock_qty,
      98,
    );
    assert.equal(
      (await db.query<{ status: string }>("select status from market_sales"))
        .rows[0].status,
      "paid",
    );
    const robo = await run((c) =>
      createSale(c, request({ postcard: 1 }), "live"),
    );
    await run((c) => confirmSale(c, robo.id));
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from market_receipt_jobs",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});

test("market contact keeps receipt email, review consent and newsletter independent; invite is due after 3 paid days", async () => {
  const { saveManualContact } = await import("../lib/market/store");
  const { db, run } = await fixture();
  try {
    await db.query(
      "insert into email_settings(id,enabled,test_mode) values(1,true,false) on conflict(id) do update set enabled=true,test_mode=false",
    );
    const sale = await run((c) =>
      createSale(c, request({ postcard: 1 }), "live", "cash"),
    );
    await run((c) =>
      saveManualContact(c, sale.token, "market@example.test", false, true),
    );
    await db.query("select prepare_market_review_invites()");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_messages where payload->>'market_sale_id'=$1",
          [sale.id],
        )
      ).rows[0].n,
      0,
    );
    await run((c) => confirmManualSale(c, sale.id, "test"));
    await db.query("select prepare_market_review_invites()");
    await db.query("select prepare_market_review_invites()");
    const message = (
      await db.query<{ delay: number; kind: string }>(
        "select extract(epoch from m.scheduled_at-s.paid_at)::float8 delay,m.kind from email_messages m join market_sales s on s.id::text=m.payload->>'market_sale_id' where s.id=$1",
        [sale.id],
      )
    ).rows;
    assert.equal(message.length, 1);
    assert.equal(message[0].delay, 72 * 3600);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions where purpose='news'",
        )
      ).rows[0].n,
      0,
    );
    await db.query(
      "update email_messages set scheduled_at=now()-interval '1 minute'",
    );
    await run((c) =>
      saveManualContact(c, sale.token, "market@example.test", true, false),
    );
    assert.equal(
      (await db.query("select * from claim_email_messages(10)")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions where purpose='news' and revoked_at is null",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      run((c) =>
        saveManualContact(c, sale.token, "changed@example.test", true, true),
      ),
      /другая/,
    );
  } finally {
    await db.close();
  }
});
test("honest market reviews issue one existing checkout coupon for any rating, without requiring publication or newsletter", async () => {
  const { saveManualContact } = await import("../lib/market/store");
  const { submitMarketReview, marketReviewState } =
    await import("../lib/market/reviews");
  const { db, run, adapter } = await fixture();
  try {
    await db.query(
      "insert into email_settings(id,enabled,test_mode) values(1,true,false) on conflict(id) do update set enabled=true,test_mode=false",
    );
    const sale = await run((c) =>
      createSale(c, request({ "plate-nevidimka": 1 }), "live", "transfer"),
    );
    const token = (
      await db.query<{ review_token: string }>(
        "select review_token from market_sales where id=$1",
        [sale.id],
      )
    ).rows[0].review_token;
    const input = {
      rating: 1,
      body: "Впечатления о встрече и изделии",
      displayName: "Анна",
      phone: "89991234567",
      accepted: true,
      publicationConsent: false,
    };
    assert.equal(await marketReviewState(adapter, token), null);
    await assert.rejects(
      run((c) => submitMarketReview(c, token, input)),
      /UNAVAILABLE/,
    );
    await run((c) =>
      saveManualContact(c, sale.token, "review@example.test", false, true),
    );
    await run((c) => confirmManualSale(c, sale.id, "test"));
    await db.query("select prepare_market_review_invites()");
    const first = await run((c) => submitMarketReview(c, token, input));
    const second = await run((c) =>
      submitMarketReview(c, token, { ...input, rating: 5, body: "повтор" }),
    );
    assert.equal(first!.reward!.code, second!.reward!.code);
    assert.equal(first!.publicationConsent, false);
    const saved = (
      await db.query<{ rating: number; body: string }>(
        "select rating,body from customer_reviews where market_sale_id=$1",
        [sale.id],
      )
    ).rows;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].rating, 1);
    assert.equal(saved[0].body, input.body);
    const reward = (
      await db.query<{ phone: string; percent: number; days: number }>(
        "select phone,percent,extract(epoch from expires_at-issued_at)/86400 days from review_rewards where source_market_sale_id=$1",
        [sale.id],
      )
    ).rows[0];
    assert.equal(reward.phone, "+79991234567");
    assert.equal(reward.percent, 10);
    assert.equal(Number(reward.days), 30);
    const messages = (
      await db.query<{ kind: string; state: string }>(
        "select kind,state from email_messages where payload->>'market_sale_id'=$1 order by kind",
        [sale.id],
      )
    ).rows;
    assert.equal(
      messages.filter((m) => m.kind === "order_review_reward").length,
      1,
    );
    assert.equal(
      messages.find((m) => m.kind === "review_invite")!.state,
      "cancelled",
    );
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "plate")!.stock_qty,
      4,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from market_sales where id=$1",
          [sale.id],
        )
      ).rows[0].status,
      "paid",
    );
    assert.equal(await marketReviewState(adapter, "a".repeat(64)), null);
  } finally {
    await db.close();
  }
});
test("test-market contacts never subscribe, send an invitation or issue a working coupon", async () => {
  const { saveManualContact } = await import("../lib/market/store");
  const { submitMarketReview } = await import("../lib/market/reviews");
  const { db, run } = await fixture();
  try {
    const sale = await run((c) =>
      createSale(c, request({ postcard: 1 }), "test", "cash"),
    );
    await run((c) =>
      saveManualContact(c, sale.token, "test@example.test", true, true),
    );
    await run((c) => confirmManualSale(c, sale.id, "test"));
    await db.query("select prepare_market_review_invites()");
    assert.equal(
      (await db.query("select * from email_subscriptions")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select * from email_messages where payload ? 'market_sale_id'",
        )
      ).rows.length,
      0,
    );
    const token = (
      await db.query<{ review_token: string }>(
        "select review_token from market_sales where id=$1",
        [sale.id],
      )
    ).rows[0].review_token;
    await assert.rejects(
      run((c) =>
        submitMarketReview(c, token, {
          rating: 5,
          body: "test",
          displayName: "Test",
          phone: "89991234567",
          accepted: true,
          publicationConsent: true,
        }),
      ),
      /UNAVAILABLE/,
    );
  } finally {
    await db.close();
  }
});

test("Robokassa receipt contact schedules feedback only after verified payment confirmation", async () => {
  const { db, run } = await fixture();
  try {
    await db.query(
      "insert into email_settings(id,enabled,test_mode) values(1,true,false)",
    );
    const sale = await run((c) =>
      createSale(c, request({ postcard: 1 }), "live"),
    );
    await run((c) =>
      savePaymentContact(c, sale, "robo@example.test", null, true, true),
    );
    await db.query("select prepare_market_review_invites()");
    assert.equal(
      (
        await db.query(
          "select * from email_messages where payload ? 'market_sale_id'",
        )
      ).rows.length,
      0,
    );
    await run((c) => confirmSale(c, sale.id));
    await run((c) => confirmSale(c, sale.id));
    await db.query("select prepare_market_review_invites()");
    await db.query("select prepare_market_review_invites()");
    assert.equal(
      (
        await db.query(
          "select * from email_messages where payload->>'market_sale_id'=$1",
          [sale.id],
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query("select * from market_receipt_jobs where sale_id=$1", [
          sale.id,
        ])
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("receipt helper access is origin bound, revocable, and safe/live trials claim only the explicitly approved sale", async () => {
  const { createHelper, authenticateHelper, revokeHelper } =
    await import("../lib/market/helper-access");
  const { claimReceiptJob } = await import("../lib/market/receipt-jobs");
  const { db, adapter, run } = await fixture();
  try {
    const credential = await run((c) =>
      createHelper(c, "Test MacBook", "a".repeat(32), "fixture-admin"),
    );
    const auth = "Bearer " + credential.token;
    assert.ok(
      await authenticateHelper(
        adapter,
        auth,
        "chrome-extension://" + "a".repeat(32),
      ),
    );
    assert.equal(
      await authenticateHelper(adapter, auth, "https://example.test"),
      null,
    );
    const first = await run((c) =>
      createSale(c, request({ postcard: 1 }), "live", "cash"),
    );
    await run((c) => confirmManualSale(c, first.id, "test"));
    const approved = await run((c) =>
      createSale(c, request({ postcard: 1 }), "live", "transfer"),
    );
    await run((c) => confirmManualSale(c, approved.id, "test"));
    const preview = await run((c) =>
      claimReceiptJob(c, "Test MacBook", "live", {
        helperId: credential.id,
        safe: true,
        allowedSaleId: approved.id,
      }),
    );
    assert.equal(preview!.sale_id, approved.id);
    assert.equal(preview!.operation_mode, "safe");
    await db.exec(
      "update market_receipt_jobs set state='queued',claim_token=null,helper_id=null,lease_until=null where state='claimed'",
    );
    const job = await run((c) =>
      claimReceiptJob(c, "Test MacBook", "live", {
        helperId: credential.id,
        safe: false,
        allowedSaleId: approved.id,
      }),
    );
    assert.equal(job!.sale_id, approved.id);
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select state from market_receipt_jobs where sale_id=$1",
          [first.id],
        )
      ).rows[0].state,
      "queued",
    );
    await run((c) => revokeHelper(c, credential.id));
    assert.equal(await authenticateHelper(adapter, auth, null), null);
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select state from market_receipt_jobs where sale_id=$1",
          [approved.id],
        )
      ).rows[0].state,
      "queued",
    );
    assert.equal(
      (await inventory(adapter)).find((i) => i.kind === "postcard")!.stock_qty,
      98,
    );
  } finally {
    await db.close();
  }
});

test("verified manual receipts queue one service email with contact before or after receipt, without marketing consent", async () => {
  const { saveManualContact } = await import("../lib/market/store");
  const { db, adapter, run } = await fixture();
  try {
    await db.exec(
      "insert into email_settings(id,enabled,test_mode) values(1,true,false) on conflict(id) do update set enabled=true,test_mode=false",
    );
    for (const contactFirst of [true, false]) {
      const sale = await run((c) =>
        createSale(
          c,
          request({ postcard: 1 }),
          "live",
          contactFirst ? "cash" : "transfer",
        ),
      );
      await run((c) => confirmManualSale(c, sale.id, "fixture"));
      const before = await inventory(adapter);
      const proof = {
        url: `https://lknpd.nalog.ru/api/v1/receipt/773212983545/fixture-${sale.id}/print`,
        registeredAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
      };
      if (contactFirst)
        await run((c) =>
          saveManualContact(c, sale.token, "buyer@example.test", false, false),
        );
      assert.equal(
        (
          await db.query(
            "select id from email_messages where kind='market_receipt'",
          )
        ).rows.length,
        contactFirst ? 0 : 1,
      );
      await run((c) => attachReceipt(c, sale.id, proof));
      if (!contactFirst)
        await run((c) =>
          saveManualContact(c, sale.token, "buyer@example.test", false, false),
        );
      await run((c) =>
        saveManualContact(c, sale.token, "buyer@example.test", false, false),
      );
      await run((c) => attachReceipt(c, sale.id, proof));
      const messages = await db.query<{ recipient: string }>(
        "select recipient from email_messages where event_key=$1",
        [`market:${sale.id}:receipt`],
      );
      assert.equal(messages.rows.length, 1);
      assert.equal(messages.rows[0].recipient, "buyer@example.test");
      assert.deepEqual(await inventory(adapter), before);
      assert.equal(
        (
          await db.query<{ status: string }>(
            "select status from market_sales where id=$1",
            [sale.id],
          )
        ).rows[0].status,
        "paid",
      );
    }
    assert.equal(
      (
        await db.query(
          "select id from email_subscriptions where purpose='news'",
        )
      ).rows.length,
      0,
    );
    const testSale = await run((c) =>
      createSale(c, request({ postcard: 1 }), "test", "cash"),
    );
    await run((c) => confirmManualSale(c, testSale.id, "fixture"));
    await run((c) =>
      saveManualContact(c, testSale.token, "test@example.test", false, false),
    );
    await run((c) =>
      attachReceipt(c, testSale.id, {
        url: `https://lknpd.nalog.ru/api/v1/receipt/773212983545/fixture-test/print`,
        registeredAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
      }),
    );
    assert.equal(
      (
        await db.query("select id from email_messages where event_key=$1", [
          `market:${testSale.id}:receipt`,
        ])
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("helper future mode excludes the backlog and trial mode never selects Robokassa or unknown submissions", async () => {
  const { configureHelperMode, createHelper } =
    await import("../lib/market/helper-access");
  const { claimReceiptJob } = await import("../lib/market/receipt-jobs");
  const { db, run } = await fixture();
  try {
    const helper = await run((c) =>
      createHelper(c, "Future device", "b".repeat(32), "test"),
    );
    const old = await run((c) =>
      createSale(c, request({ postcard: 1 }), "live", "cash"),
    );
    await run((c) => confirmManualSale(c, old.id, "test"));
    await db.query(
      "update market_receipt_jobs set created_at=now()-interval '1 hour' where sale_id=$1",
      [old.id],
    );
    await assert.rejects(
      run((c) => configureHelperMode(c, helper.id, "future")),
      /Сначала проверьте/,
    );
    await db.query(
      "update market_receipt_helpers set result_verified_at=now() where id=$1",
      [helper.id],
    );
    await run((c) => configureHelperMode(c, helper.id, "future"));
    const {
      rows: [h],
    } = await db.query<{ live_from: Date; live_all_sales: boolean }>(
      "select live_from,live_all_sales from market_receipt_helpers where id=$1",
      [helper.id],
    );
    assert.equal(h.live_all_sales, true);
    assert.ok(h.live_from);
    assert.equal(
      await run((c) =>
        claimReceiptJob(c, "future", "live", {
          helperId: helper.id,
          safe: false,
          allowedSince: h.live_from,
        }),
      ),
      null,
    );
    const fresh = await run((c) =>
      createSale(c, request({ postcard: 1 }), "live", "transfer"),
    );
    await run((c) => confirmManualSale(c, fresh.id, "test"));
    await db.query(
      "update market_receipt_jobs set created_at=now()+interval '1 second' where sale_id=$1",
      [fresh.id],
    );
    assert.equal(
      (await run((c) =>
        claimReceiptJob(c, "future", "live", {
          helperId: helper.id,
          safe: false,
          allowedSince: h.live_from,
        }),
      ))!.sale_id,
      fresh.id,
    );
    await db.query(
      "update market_receipt_jobs set state='uncertain' where sale_id=$1",
      [fresh.id],
    );
    await assert.rejects(
      run((c) => configureHelperMode(c, helper.id, "trial", fresh.id)),
      /неизвестной/,
    );
    const robo = await run((c) =>
      createSale(c, request({ postcard: 1 }), "live", "robokassa"),
    );
    await assert.rejects(
      run((c) => configureHelperMode(c, helper.id, "trial", robo.id)),
      /испытания/,
    );
    await run((c) => configureHelperMode(c, helper.id, "trial", old.id));
    const trial = (
      await db.query<{ approved_sale_id: string; live_all_sales: boolean }>(
        "select approved_sale_id,live_all_sales from market_receipt_helpers where id=$1",
        [helper.id],
      )
    ).rows[0];
    assert.equal(trial.approved_sale_id, old.id);
    assert.equal(trial.live_all_sales, false);
    await run((c) => configureHelperMode(c, helper.id, "safe"));
    assert.equal(
      (
        await db.query<{ live_enabled: boolean }>(
          "select live_enabled from market_receipt_helpers where id=$1",
          [helper.id],
        )
      ).rows[0].live_enabled,
      false,
    );
  } finally {
    await db.close();
  }
});

type IntakeTestRow = {
  n: number;
  stock_qty: number;
  paid_at: Date;
  confirmed_by: string;
  status: string;
  current_sale_id: string;
};
const intakeInput = (method = "cash", amount = "12000") => ({
  requestKey: randomUUID(),
  amount,
  email: "buyer@example.test",
  method,
  accepted: true,
  marketingConsent: false,
  reviewConsent: false,
});
test("amount-only input uses integer kopecks and rejects ambiguous values", () => {
  assert.equal(amountInKopecks("12 000,50"), 1200050);
  assert.equal(amountInKopecks("1.01"), 101);
  for (const s of ["-10", "1e4", "0", "1.001", "NaN", "1000001", "12,00.00"])
    assert.throws(() => amountInKopecks(s));
});
test("parallel amount purchases leave iPad and stock untouched until exact composition", async () => {
  const { db, run } = await fixture();
  try {
    await db.query<IntakeTestRow>(
      "update market_register set intake_enabled=true",
    );
    const current = await run((d) =>
      createSale(d, request({ postcard: 1 }), "test", "cash"),
    );
    const a = await run((d) =>
      createIntake(d, intakeInput(), "live", "device-a"),
    );
    const b = await run((d) =>
      createIntake(d, intakeInput("transfer"), "live", "device-b"),
    );
    assert.notEqual(a.token, b.token);
    assert.equal(
      (
        await db.query<IntakeTestRow>(
          "select count(*)::int n from market_receipt_jobs",
        )
      ).rows[0].n,
      0,
    );
    await assert.rejects(
      run((d) =>
        finalizeIntake(d, a.id, request({ "plate-nevidimka": 2 }), "seller"),
      ),
      /подтвердите/,
    );
    await run((d) => confirmIntake(d, a.id, "seller"));
    await run((d) => confirmIntake(d, a.id, "other"));
    const paidAt = "2026-11-07T20:55:00.000Z";
    await db.query<IntakeTestRow>(
      "update market_intakes set paid_at=$2 where id=$1",
      [a.id, paidAt],
    );
    for (const n of [1, 3])
      await assert.rejects(
        run((d) =>
          finalizeIntake(d, a.id, request({ "plate-nevidimka": n }), "seller"),
        ),
        /точно совпадать/,
      );
    assert.equal(
      (
        await db.query<IntakeTestRow>(
          "select stock_qty from market_inventory where key='plate-nevidimka'",
        )
      ).rows[0].stock_qty,
      5,
    );
    assert.equal(
      (
        await db.query<IntakeTestRow>(
          "select count(*)::int n from market_receipt_jobs",
        )
      ).rows[0].n,
      0,
    );
    const sale = await run((d) =>
      finalizeIntake(d, a.id, request({ "plate-nevidimka": 2 }), "seller"),
    );
    const saved = (
      await db.query<IntakeTestRow>("select * from market_sales where id=$1", [
        sale.id,
      ])
    ).rows[0];
    assert.equal(saved.status, "paid");
    assert.equal(new Date(saved.paid_at).toISOString(), paidAt);
    assert.equal(saved.confirmed_by, "seller");
    assert.equal(
      (
        await db.query<IntakeTestRow>(
          "select current_sale_id from market_register",
        )
      ).rows[0].current_sale_id,
      current.id,
    );
    assert.equal(
      (
        await db.query<IntakeTestRow>(
          "select stock_qty from market_inventory where key='plate-nevidimka'",
        )
      ).rows[0].stock_qty,
      3,
    );
    assert.equal(
      (
        await db.query<IntakeTestRow>(
          "select count(*)::int n from market_receipt_jobs where sale_id=$1",
          [sale.id],
        )
      ).rows[0].n,
      1,
    );
    const again = await run((d) =>
      finalizeIntake(d, a.id, request({ "plate-nevidimka": 2 }), "seller"),
    );
    assert.equal(again.id, sale.id);
    await assert.rejects(
      run((d) =>
        finalizeIntake(d, a.id, request({ "plate-nevidimka": 1 }), "seller"),
      ),
      /Состав уже сохранён/,
    );
    await assert.rejects(
      run((d) => cancelIntake(d, a.id)),
      /неоплаченную/,
    );
    assert.equal(
      (
        await db.query<IntakeTestRow>(
          "select stock_qty from market_inventory where key='plate-nevidimka'",
        )
      ).rows[0].stock_qty,
      3,
    );
  } finally {
    await db.close();
  }
});
test("amount purchase retry, closure and rate limits do not invent paid sales", async () => {
  const { db, run } = await fixture();
  try {
    const input = intakeInput();
    await assert.rejects(
      run((d) => createIntake(d, input, "test", "client")),
      /закрыт/,
    );
    await db.query<IntakeTestRow>(
      "update market_register set intake_enabled=true",
    );
    const first = await run((d) => createIntake(d, input, "test", "client"));
    assert.equal(
      (await run((d) => createIntake(d, input, "test", "client"))).id,
      first.id,
    );
    await assert.rejects(
      run((d) =>
        createIntake(d, { ...input, amount: "6000" }, "test", "client"),
      ),
      /другими/,
    );
    for (let i = 1; i < 10; i++)
      await run((d) => createIntake(d, intakeInput(), "test", "client"));
    await assert.rejects(
      run((d) => createIntake(d, intakeInput(), "test", "client")),
      /Слишком много/,
    );
    await run((d) => cancelIntake(d, first.id));
    await assert.rejects(
      run((d) => confirmIntake(d, first.id, "seller")),
      /нельзя/,
    );
    assert.equal(
      (
        await db.query<IntakeTestRow>(
          "select count(*)::int n from market_sales",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
test("Robokassa amount purchases require exact snapshot before payment and never enqueue NPD", async () => {
  const { db, run } = await fixture();
  try {
    await db.query<IntakeTestRow>(
      "update market_register set intake_enabled=true",
    );
    const a = await run((d) =>
      createIntake(d, intakeInput("robokassa"), "live", "a"),
    );
    const b = await run((d) =>
      createIntake(d, intakeInput("robokassa"), "live", "b"),
    );
    await assert.rejects(
      run((d) => confirmIntake(d, a.id, "seller")),
      /нельзя/,
    );
    await assert.rejects(
      run((d) =>
        finalizeIntake(d, a.id, request({ "plate-nevidimka": 1 }), "seller"),
      ),
      /точно/,
    );
    const sa = await run((d) =>
      finalizeIntake(d, a.id, request({ "plate-nevidimka": 2 }), "seller"),
    );
    const sb = await run((d) =>
      finalizeIntake(d, b.id, request({ "plate-nevidimka": 2 }), "seller"),
    );
    assert.notEqual(sa.id, sb.id);
    assert.equal(
      (
        await db.query<IntakeTestRow>(
          "select count(*)::int n from market_receipt_jobs",
        )
      ).rows[0].n,
      0,
    );
    await run((d) => confirmSale(d, sa.id));
    await run((d) => confirmSale(d, sa.id));
    assert.equal(
      (
        await db.query<IntakeTestRow>(
          "select stock_qty from market_inventory where key='plate-nevidimka'",
        )
      ).rows[0].stock_qty,
      1,
    );
    assert.equal(
      (
        await db.query<IntakeTestRow>(
          "select count(*)::int n from market_receipt_jobs",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
