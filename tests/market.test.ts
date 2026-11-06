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
  const adapter = db as unknown as MarketDb;
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
        attachReceipt(
          client,
          sale.id,
          "https://lknpd.nalog.ru/api/v1/receipt/773212983545/test123/print",
        ),
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
        attachReceipt(client, sale.id, "http://127.0.0.1/receipt"),
      ),
      /ссылка/,
    );
    await run((client) =>
      attachReceipt(
        client,
        sale.id,
        "https://lknpd.nalog.ru/api/v1/receipt/773212983545/test123/print",
      ),
    );
    await assert.rejects(
      run((client) =>
        attachReceipt(
          client,
          sale.id,
          "https://lknpd.nalog.ru/api/v1/receipt/773212983545/other/print",
        ),
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
