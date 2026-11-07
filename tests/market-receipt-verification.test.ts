import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { verifyReceipt } from "../lib/market/verify-receipt";
const url = "https://lknpd.nalog.ru/api/v1/receipt/773212983545/fixture/print";
const time = "2026-01-01T10:00:00Z";
test("receipt confirmation rejects fake URLs, missing receipts, HTML and corrupt documents", async () => {
  let calls = 0;
  const missing: typeof fetch = async () => {
    calls++;
    return new Response("", { status: 404 });
  };
  await assert.rejects(
    verifyReceipt("https://example.test/fake", time, missing),
    /оригинальный/,
  );
  assert.equal(calls, 0);
  await assert.rejects(verifyReceipt(url, time, missing), /не подтвердила/);
  await assert.rejects(
    verifyReceipt(
      url,
      time,
      async () =>
        new Response("<html>OK</html>", {
          headers: { "content-type": "text/html" },
        }),
    ),
    /изображение/,
  );
  await assert.rejects(
    verifyReceipt(
      url,
      time,
      async () =>
        new Response("not a PDF", {
          headers: { "content-type": "application/pdf" },
        }),
    ),
  );
  await assert.rejects(
    verifyReceipt(
      url,
      time,
      async () =>
        new Response(new Uint8Array(), {
          headers: { "content-type": "image/png" },
        }),
    ),
    /пустой/,
  );
});
test("receipt confirmation records only verified document and uses bounded nonredirecting request", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  const proof = await verifyReceipt(url, time, async (input, init) => {
    assert.equal(input, url);
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": "application/pdf" },
    });
  });
  assert.equal(proof.url, url);
  assert.equal(proof.registeredAt, new Date(time).toISOString());
  assert.ok(proof.verifiedAt);
});
