import test from "node:test";
import assert from "node:assert/strict";
import { checkoutSchema } from "../lib/validation";
import { EMAIL_CONSENT_VERSION } from "../lib/legal";
const order = {
  name: "Тест Покупатель",
  phone: "+79990000000",
  email: "test@example.invalid",
  deliveryType: "russia",
  address: "Москва, пункт выдачи",
  comment: "",
  legalVersion: "2026-10-23-2",
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
test("advertising requires its matching data-processing permission", () => {
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

test("checkout requires a full name and accepts only an optional Telegram username", () => {
  assert.equal(
    checkoutSchema.safeParse({ ...order, name: "Анна" }).success,
    false,
  );
  assert.equal(
    checkoutSchema.parse({
      ...order,
      name: "Анна Иванова",
      telegram: " @anna_ceramics ",
    }).telegram,
    "anna_ceramics",
  );
  assert.equal(checkoutSchema.parse(order).telegram, "");
  for (const telegram of [
    "123456789",
    "https://t.me/anna",
    "Анна",
    "@abc",
    "user/name",
  ]) {
    assert.equal(
      checkoutSchema.safeParse({ ...order, telegram }).success,
      false,
    );
  }
});

test("order notices and reviews remain enabled without advertisements; aggregate flags cannot create advertisements", () => {
  const enabled = checkoutSchema.parse({
    ...order,
    emailConsent: false,
    subscribeToNews: true,
    newsletterDataConsent: true,
  });
  assert.equal(enabled.subscribeToNews, true);
  assert.equal(enabled.newsletterDataConsent, true);
  assert.equal(enabled.reviewConsent, true);
  assert.equal(enabled.emailConsent, true);
  assert.equal(enabled.emailConsentVersion, EMAIL_CONSENT_VERSION);
  const forged = checkoutSchema.parse({ ...order, emailConsent: true });
  assert.equal(forged.emailConsent, true);
  assert.equal(forged.subscribeToNews, false);
  const disabled = checkoutSchema.parse({
    ...order,
    emailConsent: false,
    reviewConsent: true,
    subscribeToNews: false,
    newsletterDataConsent: false,
  });
  assert.equal(disabled.subscribeToNews, false);
  assert.equal(disabled.reviewConsent, true);
  assert.equal(
    checkoutSchema.safeParse({
      ...order,
      emailConsent: true,
      acceptedTerms: false,
    }).success,
    false,
  );
});
