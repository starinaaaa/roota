import {
  RobokassaClient,
  type Receipt,
  type HashAlgorithm,
} from "@robokassa/sdk";

export type PaymentMode = "test" | "live";
export type PaymentRow = {
  id: string;
  inv_id: string;
  mode: PaymentMode;
  amount: string;
  status: "pending" | "paid";
  order_id: string | null;
  test_order_id: string | null;
  cart_session: string;
  email: string;
  items: {
    name: string;
    quantity: number;
    sum: number;
    kind: "goods" | "delivery" | "insurance";
  }[];
  receipt: Receipt | null;
  paid_at: string | null;
};

// Accept Robokassa's six-place callback amounts without floating-point comparison.
export function amountInKopecks(value: string): bigint {
  if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(value))
    throw new Error("INVALID_AMOUNT");
  const [whole, fraction = ""] = value.split(".");
  if (/[^0]/.test(fraction.slice(2))) throw new Error("INVALID_AMOUNT");
  return (
    BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0").slice(0, 2))
  );
}

export function sdkFor(
  mode: PaymentMode,
  env: Record<string, string | undefined> = process.env,
) {
  const algorithm = env.ROBOKASSA_HASH_ALGORITHM;
  if (!algorithm || !["md5", "sha256", "sha512"].includes(algorithm))
    throw new Error("PAYMENT_CONFIG");
  const p1 =
    mode === "test" ? env.ROBOKASSA_TEST_PASSWORD1 : env.ROBOKASSA_PASSWORD1;
  const p2 =
    mode === "test" ? env.ROBOKASSA_TEST_PASSWORD2 : env.ROBOKASSA_PASSWORD2;
  if (!p1 || !p2 || !env.ROBOKASSA_MERCHANT_LOGIN)
    throw new Error("PAYMENT_CONFIG");
  // SDK requires the production slots even in test mode. Supply test values there,
  // too, so a test deployment never needs production credentials.
  return new RobokassaClient({
    login: env.ROBOKASSA_MERCHANT_LOGIN,
    password1: p1,
    password2: p2,
    testPassword1: mode === "test" ? p1 : undefined,
    testPassword2: mode === "test" ? p2 : undefined,
    isTest: mode === "test",
    hashAlgorithm: algorithm as HashAlgorithm,
  });
}

export function callbackFields(body: string) {
  if (body.length > 16384) throw new Error("INVALID_NOTIFICATION");
  const params = new URLSearchParams(body),
    fields: Record<string, string> = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(fields, key)) throw new Error("DUPLICATE_PARAMETER");
    fields[key] = value;
  }
  if (
    !/^[1-9]\d{0,15}$/.test(fields.InvId ?? "") ||
    !fields.OutSum ||
    !fields.SignatureValue
  )
    throw new Error("INVALID_NOTIFICATION");
  return fields;
}

export function verifyPaymentNotification(
  payment: PaymentRow,
  fields: Record<string, string>,
  env: Record<string, string | undefined> = process.env,
) {
  const client = sdkFor(payment.mode, env);
  client.notification.verifyResultURL(
    client.notification.parseResultURL(fields),
  );
  if (
    fields.InvId !== String(payment.inv_id) ||
    fields.Shp_payment !== payment.id ||
    fields.Shp_mode !== payment.mode
  )
    throw new Error("PAYMENT_MISMATCH");
  if (
    Object.hasOwn(fields, "IsTest") &&
    fields.IsTest !== (payment.mode === "test" ? "1" : "0")
  )
    throw new Error("MODE_MISMATCH");
  if (
    amountInKopecks(fields.OutSum) !== amountInKopecks(String(payment.amount))
  )
    throw new Error("AMOUNT_MISMATCH");
}
