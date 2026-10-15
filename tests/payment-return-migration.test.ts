import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { PaymentReturn } from "../lib/payments/return-page";

test("cross-site payment returns cannot replace the owner's cart cookie or disclose a payment", async () => {
  const id = "735e97e2-4868-441f-918d-82734e03cfaa";
  for (const path of ["success", "fail"]) {
    const response = proxy(new NextRequest(`https://shop.example.invalid/payment/${path}?Shp_payment=${id}`));
    assert.equal(response.cookies.get("cart_session"), undefined);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
  const bridge = await PaymentReturn({searchParams:Promise.resolve({Shp_payment:id}),failed:false});
  assert.deepEqual(bridge.props, {href:`/payment/${id}`});
  const failed = await PaymentReturn({searchParams:Promise.resolve({Shp_payment:id}),failed:true});
  assert.deepEqual(failed.props, {href:`/payment/${id}?failed=1`});
  await assert.rejects(PaymentReturn({searchParams:Promise.resolve({Shp_payment:"https://evil.example"}),failed:false}));
});
