import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import QRCode from "qrcode";
import {
  parseReceiptText,
  verifyReceiptImage,
} from "../lib/market/receipt-image-proof";
const plan = {
  date: "2026-11-07",
  total: 1000,
  rows: [{ name: "Открытка", kopecks: 1000 }],
};
const text =
  "Чек №fixture\n07.11.26 17:10(+03:00)\nНаименование Сумма\n1. Открытка 10,00\nИтого: 10,00 ₽\nИНН 773212983545";
test("receipt image text requires exact rows, price, total and settlement date", () => {
  assert.deepEqual(parseReceiptText(text, plan), {
    registeredAt: "2026-11-07T14:10:00.000Z",
    total: 1000,
  });
  for (const changed of [
    text.replace("Открытка", "Тарелка"),
    text.replace("1. Открытка 10,00", "1. Открытка 20,00"),
    text.replace("Итого: 10,00", "Итого: 20,00"),
    text.replace("07.11.26", "08.11.26"),
    text.replace("07.11.26", "31.02.26"),
    text.replace("17:10", "27:10"),
    text + "\nИтого: 10,00",
    text.replace("1. Открытка", "2. Открытка"),
    text + "\nАННУЛИРОВАН",
  ])
    assert.throws(() => parseReceiptText(changed, plan));
  assert.throws(() =>
    parseReceiptText(text, { ...plan, rows: [...plan.rows, ...plan.rows] }),
  );
  const plate = "Керамическая тарелка «Поцелуй»";
  const wrapped = text.replace(
    "1. Открытка 10,00",
    "1. Керамическая тарелка 10,00\n„Поцелуй“",
  );
  assert.equal(
    parseReceiptText(wrapped, {
      ...plan,
      rows: [{ name: plate, kopecks: 1000 }],
    }).total,
    1000,
  );
});
test("local OCR verifies a QR-bearing original, fingerprint and snapshot; repeats reuse proof and keep the submission-time fence", async () => {
  const url = `https://lknpd.nalog.ru/api/v1/receipt/773212983545/fixture-${randomUUID()}/print`;
  const lines = [
    "Чек №fixture",
    "07.11.26 17:10(+03:00)",
    "Наименование       Сумма",
    "1. Открытка            10,00",
    "Итого:                     10,00",
    "Режим НО НПД",
    "ИНН 773212983545",
  ];
  const svg = Buffer.from(
    `<svg width="330" height="560"><rect width="330" height="560" fill="white"/><g fill="black" font-family="Arial" font-size="15">${lines.map((s, i) => `<text x="25" y="${40 + i * 46}">${s}</text>`).join("")}</g></svg>`,
  );
  const qr = await QRCode.toBuffer(url, { width: 130, margin: 2 });
  const bytes = await sharp(svg)
    .composite([{ input: qr, left: 100, top: 410 }])
    .png()
    .toBuffer();
  const raw = await sharp(bytes)
    .flatten({ background: "#fff" })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer();
  const hash = createHash("sha256").update(raw).digest("hex");
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": "image/png" },
    });
  }) as typeof fetch;
  const proof = await verifyReceiptImage(
    url,
    hash,
    plan,
    new Date("2026-11-07T14:10:30Z"),
    fetcher,
  );
  assert.equal(proof.url, url);
  assert.equal(proof.registeredAt, "2026-11-07T14:10:00.000Z");
  assert.equal(proof.total, 1000);
  await verifyReceiptImage(url, hash, plan, null, fetcher);
  assert.equal(calls, 2);
  await assert.rejects(
    verifyReceiptImage(
      url,
      hash,
      plan,
      new Date("2026-11-07T14:12:00Z"),
      fetcher,
    ),
    /Время/,
  );
  assert.equal(calls, 3);
  await assert.rejects(
    verifyReceiptImage(url, "a".repeat(64), plan, null, fetcher),
    /изображением/,
  );
  await assert.rejects(
    verifyReceiptImage(
      url.replace("/fixture-", "/other-"),
      hash,
      plan,
      null,
      fetcher,
    ),
    /QR/,
  );
});
