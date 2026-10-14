import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildReceipt,
  parseReceiptProfile,
  validateReceipt,
} from "../lib/payments/receipt";
import { sdkFor } from "../lib/payments/model";
const raw = JSON.stringify({
  goods: { tax: "none" },
  delivery: { tax: "none" },
  insurance: { tax: "none" },
});
const profile = parseReceiptProfile(raw, "live")!;
test("SMZ receipt names, quantities, delivery and insurance exactly match payment including copecks", () => {
  const receipt = buildReceipt(
    {
      amount: "12055.03",
      items: [
        { name: "Тарелка «Поцелуй»", quantity: 2, sum: 12000, kind: "goods" },
        { name: "Доставка", quantity: 1, sum: 50.01, kind: "delivery" },
        {
          name: "Страхование доставки",
          quantity: 1,
          sum: 5.02,
          kind: "insurance",
        },
      ],
    },
    profile,
  );
  assert.equal(receipt.items.length, 2);
  assert.equal(receipt.items[1].name, "Доставка");
  assert.equal(receipt.items[1].sum, 55.03);
  assert.doesNotMatch(JSON.stringify(receipt), /страхова/i);
  assert.equal(receipt.items[0].quantity, 2);
  assert.equal(receipt.items[0].sum, 12000);
  assert.equal(receipt.items[0].name, "Тарелка «Поцелуй»");
  assert.ok(receipt.items.every((item) => item.tax === "none"));
  assert.equal(receipt.sno, undefined);
  assert.equal(receipt.items[0].payment_method, undefined);
  assert.throws(
    () => validateReceipt(receipt, "12055.04"),
    /RECEIPT_AMOUNT_MISMATCH/,
  );
  assert.throws(() => validateReceipt({ items: [] }, "1"));
  assert.throws(() =>
    validateReceipt(
      { items: [{ name: "x", quantity: 1, sum: 1.001, tax: "none" }] },
      "1",
    ),
  );
  assert.throws(() =>
    validateReceipt(
      { items: [{ name: "x", quantity: 0, sum: 1, tax: "none" }] },
      "1",
    ),
  );
  assert.throws(() => validateReceipt(null, "1"));
  assert.throws(
    () => parseReceiptProfile(undefined, "live"),
    /RECEIPT_NOT_APPROVED/,
  );
  assert.equal(parseReceiptProfile(undefined, "test"), null);
  assert.throws(() =>
    parseReceiptProfile(
      JSON.stringify({ ...JSON.parse(raw), sno: "npd" }),
      "live",
    ),
  );
});
test("live POST contains signed URL-encoded receipt and uses production rather than test credentials", () => {
  const receipt = buildReceipt(
    {
      amount: "6000",
      items: [
        { name: "Тарелка «Поцелуй»", quantity: 1, sum: 6000, kind: "goods" },
      ],
    },
    profile,
  );
  const form = sdkFor("live", {
    ROBOKASSA_MERCHANT_LOGIN: "rootaa",
    ROBOKASSA_HASH_ALGORITHM: "md5",
    ROBOKASSA_PASSWORD1: "live-p1",
    ROBOKASSA_PASSWORD2: "live-p2",
    ROBOKASSA_TEST_PASSWORD1: "test-p1",
    ROBOKASSA_TEST_PASSWORD2: "test-p2",
  }).payment.buildPaymentForm({
    Description: "Roota проверка чека",
    OutSum: "6000.00",
    InvID: "123",
    Receipt: receipt,
    ShpFields: { Shp_mode: "live", Shp_payment: "payment-id" },
    SuccessURL2: "https://roota.moscow/order/abc",
    SuccessURL2Method: "GET",
    FailURL2: "https://roota.moscow/order/abc",
    FailURL2Method: "GET",
  });
  const f = form.fields;
  assert.equal(form.method, "POST");
  assert.notEqual(f.IsTest, "1");
  assert.deepEqual(JSON.parse(decodeURIComponent(String(f.Receipt))), receipt);
  assert.equal(
    f.SignatureValue,
    createHash("md5")
      .update(
        `rootaa:6000.00:123:${f.Receipt}:https://roota.moscow/order/abc:GET:https://roota.moscow/order/abc:GET:live-p1:Shp_mode=live:Shp_payment=payment-id`,
      )
      .digest("hex"),
  );
  assert.ok(!JSON.stringify(f).includes("live-p1"));
});

test("receipt keeps service lines separate when fiscal attributes differ", () => {
  const receipt = buildReceipt(
    {
      amount: "115",
      items: [
        { name: "Тарелка", quantity: 1, sum: 100, kind: "goods" },
        { name: "Доставка", quantity: 1, sum: 10, kind: "delivery" },
        { name: "Страхование", quantity: 1, sum: 5, kind: "insurance" },
      ],
    },
    { ...profile, insurance: { tax: "vat0" } },
  );
  assert.equal(receipt.items.length, 3);
  assert.equal(receipt.items[2].tax, "vat0");
  assert.equal(receipt.items[2].name, "Доставка");
});
