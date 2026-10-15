import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { PaymentReturn } from "../lib/payments/return-page";

test("migration maintenance blocks handlers and cookie writes but preserves the staging health probe", () => {
  const oldEnv = process.env.APP_ENV,
    oldFlag = process.env.MIGRATION_MAINTENANCE;
  try {
    process.env.APP_ENV = "migration";
    process.env.MIGRATION_MAINTENANCE = "true";
    for (const path of [
      "/checkout",
      "/api/payments/robokassa/result",
      "/admin",
    ]) {
      const response = proxy(
        new NextRequest("https://stage.example.invalid" + path),
      );
      assert.equal(response.status, 503);
      assert.equal(response.cookies.get("cart_session"), undefined);
    }
    assert.equal(
      proxy(new NextRequest("https://stage.example.invalid/")).status,
      200,
    );
    process.env.APP_ENV = "production";
    assert.notEqual(
      proxy(new NextRequest("https://shop.example.invalid/checkout")).status,
      503,
    );
  } finally {
    if (oldEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = oldEnv;
    if (oldFlag === undefined) delete process.env.MIGRATION_MAINTENANCE;
    else process.env.MIGRATION_MAINTENANCE = oldFlag;
  }
});

test("cross-site payment returns cannot replace the owner's cart cookie or disclose a payment", async () => {
  const id = "735e97e2-4868-441f-918d-82734e03cfaa";
  for (const path of ["success", "fail"]) {
    const response = proxy(
      new NextRequest(
        `https://shop.example.invalid/payment/${path}?Shp_payment=${id}`,
      ),
    );
    assert.equal(response.cookies.get("cart_session"), undefined);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
  const bridge = await PaymentReturn({
    searchParams: Promise.resolve({ Shp_payment: id }),
    failed: false,
  });
  assert.deepEqual(bridge.props, { href: `/payment/${id}` });
  const failed = await PaymentReturn({
    searchParams: Promise.resolve({ Shp_payment: id }),
    failed: true,
  });
  assert.deepEqual(failed.props, { href: `/payment/${id}?failed=1` });
  await assert.rejects(
    PaymentReturn({
      searchParams: Promise.resolve({ Shp_payment: "https://evil.example" }),
      failed: false,
    }),
  );
});
