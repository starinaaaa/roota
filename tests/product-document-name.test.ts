import test from "node:test";
import assert from "node:assert/strict";
import {
  gardenDocumentName,
  productDocumentName,
} from "../lib/product-document-name";
import {
  buildReceipt,
  buildWebsiteReceipt,
  parseReceiptProfile,
} from "../lib/payments/receipt";
import { shipmentDescription } from "../lib/delivery/shipment-description";
import { quoteBasket, type InventoryItem } from "../lib/market/model";
import { renderEmail } from "../lib/email/templates";
const profile = parseReceiptProfile(
  JSON.stringify({
    goods: { tax: "none" },
    delivery: { tax: "none" },
    insurance: { tax: "none" },
  }),
  "live",
)!;
const configuration = { size: 12 as const, stems: 6, flowers: 3, leaves: 3 };
const expected =
  "Керамический конструктор «Сад» — 12 деталей (6 стеблей, 3 цветочка, 3 листочка)";
test("legacy garden names, website receipts, Ozon, market/FNS and email use the same actual composition", () => {
  for (const name of [
    "Сад — Садовый дворик (стебли: 6, цветочки: 3, листочки: 3)",
    "Керамический конструктор «Сад» — Палисадник (стебли: 6, цветочки: 3, листочки: 3)",
  ]) {
    assert.equal(gardenDocumentName(name), expected);
    assert.equal(productDocumentName(name, configuration), expected);
    assert.equal(
      shipmentDescription([
        {
          product_name: name,
          configuration,
          quantity: 1,
          category: { slug: "objects" },
        },
      ]),
      expected + " × 1",
    );
    const pay = {
      amount: "4013.01",
      items: [
        { kind: "goods" as const, name, quantity: 1, sum: 3900 },
        {
          kind: "delivery" as const,
          name: "Доставка",
          quantity: 1,
          sum: 113.01,
        },
      ],
    };
    const before = structuredClone(pay);
    const receipt = buildWebsiteReceipt(pay, profile);
    assert.equal(receipt.items[0].name, expected);
    assert.equal(receipt.items[1].sum, 113.01);
    assert.deepEqual(pay, before);
    assert.equal(buildReceipt(pay, profile).items[0].name, expected);
  }
  const inventory = [
    ["stems", "Стебли-кубики", 350],
    ["flowers", "Цветочки", 350],
    ["leaves", "Листочки", 250],
  ].map(([kind, name, price]) => ({
    key: kind,
    kind,
    name,
    receipt_name: name,
    price,
    stock_qty: 100,
    product_id: null,
    image: null,
  })) as InventoryItem[];
  const quote = quoteBasket(
    {
      requestKey: "test",
      quantities: { stems: 6, flowers: 3, leaves: 3 },
      gardenBundle: true,
    },
    inventory,
  );
  assert.equal(quote.items[0].name, expected); // The FNS helper consumes these exact saved sale.items.
  assert.equal(quote.amount, 3900);
  assert.equal(
    buildReceipt({ amount: String(quote.amount), items: quote.items }, profile)
      .items[0].name,
    expected,
  );
  const email = renderEmail(
    { subject: "Покупка", body: "Спасибо!\n{{items}}" },
    { items: expected + " × 1 — 3900 ₽" },
    "https://roota.moscow",
    "Открыть",
  );
  assert.ok(email.plaintext.includes(expected));
  assert.ok(email.html.includes(expected));
});
test("actual detail count wins over stale bundle size, and names stay within fiscal limits", () => {
  assert.equal(
    gardenDocumentName("Сад", { stems: 4, flowers: 3, leaves: 2 }),
    "Керамический конструктор «Сад» — 9 деталей (4 стебля, 3 цветочка, 2 листочка)",
  );
  for (const c of [
    { stems: 1, flowers: 0, leaves: 0 },
    { stems: 11, flowers: 12, leaves: 14 },
    { stems: 100, flowers: 0, leaves: 0 },
  ]) {
    const name = gardenDocumentName("", c)!;
    assert.ok(name.length <= 128);
    assert.equal(productDocumentName(name), name);
  }
  assert.throws(() =>
    gardenDocumentName("", { stems: -1, flowers: 3, leaves: 0 }),
  );
  assert.equal(gardenDocumentName("Открытка"), null);
  assert.equal(productDocumentName("Открытка"), "Открытка");
});
test("plate names match in Ozon and receipts without repeating the type", () => {
  for (const name of [
    "Поцелуй",
    "Тарелка «Поцелуй»",
    "Тарелка керамическая «Поцелуй»",
    "Керамическая тарелка «Поцелуй»",
  ]) {
    const canonical = "Керамическая тарелка «Поцелуй»";
    assert.equal(
      shipmentDescription([
        { product_name: name, quantity: 2, category: { slug: "plates" } },
      ]),
      canonical + " × 2",
    );
    assert.equal(
      buildWebsiteReceipt(
        {
          amount: "12000",
          items: [{ name, kind: "goods", quantity: 2, sum: 12000 }],
        },
        profile,
      ).items[0].name,
      canonical,
    );
  }
});
