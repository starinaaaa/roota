import test from "node:test";
import assert from "node:assert/strict";
import { readCheckoutDraft, CHECKOUT_DRAFT_TTL } from "../lib/checkout-draft";
import { checkoutSchema } from "../lib/validation";
import { LEGAL_VERSION } from "../lib/legal";
import { ozonCheckoutError } from "../lib/delivery/checkout-errors";
const now = 1700000000000;
const draft = {
  savedAt: now,
  legalVersion: LEGAL_VERSION,
  firstName: "Анна",
  lastName: "Иванова",
  phone: "+79991234567",
  email: "anna@example.com",
  telegram: "anna_ceramics",
  comment: "Подарок",
  emailConsent: true,
  delivery: {
    city: { name: "Москва", latitude: 55.7, longitude: 37.6 },
    point: { id: 1438496, name: "Пункт Ozon", address: "Москва" },
    method: true,
  },
  acceptedTerms: true,
  deliveryQuoteId: "stale",
  quote: { totalCost: 1 },
};
test("draft restores only permitted contact and selection fields, never terms or a cached price", () => {
  const restored = readCheckoutDraft(JSON.stringify(draft), now)!;
  assert.equal(restored.firstName, "Анна");
  assert.equal(restored.delivery?.point?.id, 1438496);
  assert.equal("acceptedTerms" in restored, false);
  assert.equal("quote" in restored, false);
  assert.equal("deliveryQuoteId" in restored, false);
  assert.equal(
    readCheckoutDraft(JSON.stringify({ ...draft, legalVersion: "old" }), now)
      ?.emailConsent,
    false,
  );
  assert.equal(
    readCheckoutDraft(JSON.stringify(draft), now + CHECKOUT_DRAFT_TTL + 1),
    null,
  );
  assert.equal(readCheckoutDraft("bad json", now), null);
  assert.equal(
    readCheckoutDraft(JSON.stringify({ ...draft, phone: 42 }), now),
    null,
  );
});
test("checkout joins separately validated names on the server and rejects an incomplete name", () => {
  const input = {
    name: "Forged Name",
    firstName: " Анна ",
    lastName: " Иванова ",
    telegram: "@anna_ceramics",
    phone: "+79991234567",
    email: "anna@example.com",
    deliveryType: "russia",
    address: "Москва, ПВЗ",
    comment: "",
    legalVersion: LEGAL_VERSION,
    acceptedTerms: true,
  };
  const result = checkoutSchema.parse(input);
  assert.equal(result.name, "Анна Иванова");
  assert.equal(result.telegram, "anna_ceramics");
  const missing = checkoutSchema.safeParse({ ...input, lastName: "" });
  assert.equal(missing.success, false);
  if (!missing.success)
    assert.ok(missing.error.issues.some((i) => i.path[0] === "lastName"));
  assert.equal(
    checkoutSchema.safeParse({
      ...input,
      firstName: undefined,
      lastName: undefined,
      name: "Анна Иванова",
    }).success,
    true,
  );
});
test("Ozon calculation failure does not falsely blame the selected pickup point", () => {
  assert.match(
    ozonCheckoutError("delivery_calculation_error", 1),
    /низкой стоимостью/,
  );
  assert.doesNotMatch(
    ozonCheckoutError("delivery_calculation_error", 6000),
    /другой пункт/,
  );
  assert.match(ozonCheckoutError("new_vendor_error", 6000), /Повторите расчёт/);
});
