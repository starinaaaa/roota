import test from "node:test";
import assert from "node:assert/strict";
import { checkoutSchema } from "../lib/validation";
const order = {
  name: "Тест",
  phone: "+79990000000",
  email: "test@example.invalid",
  deliveryType: "russia",
  address: "Москва, пункт выдачи",
  comment: "",
  legalVersion: "2026-10-11",
  acceptedTerms: true,
};
test("checkout requires explicit acceptance but never requires advertising", () => {
  assert.equal(checkoutSchema.safeParse(order).success, true);
  assert.equal(
    checkoutSchema.safeParse({ ...order, acceptedTerms: false }).success,
    false,
  );
  const missing: Partial<typeof order> = { ...order };
  delete missing.acceptedTerms;
  assert.equal(checkoutSchema.safeParse(missing).success, false);
  const parsed = checkoutSchema.parse(order);
  assert.equal(parsed.subscribeToNews, false);
  assert.equal(parsed.newsletterDataConsent, false);
});
test("advertising and data processing have separate affirmative choices", () => {
  assert.equal(
    checkoutSchema.safeParse({ ...order, subscribeToNews: true }).success,
    false,
  );
  assert.equal(
    checkoutSchema.safeParse({
      ...order,
      subscribeToNews: true,
      newsletterDataConsent: true,
    }).success,
    true,
  );
  assert.equal(
    checkoutSchema.safeParse({
      ...order,
      subscribeToNews: false,
      newsletterDataConsent: true,
    }).success,
    true,
  );
});

test("outdated document acceptance cannot be silently relabelled", () => {
  assert.equal(
    checkoutSchema.safeParse({ ...order, legalVersion: "2026-10-06" }).success,
    false,
  );
});
