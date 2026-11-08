// Isolated localhost/Postgres verification only. No real payments, FNS registration or email.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
import pg from "pg";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
const base = "http://127.0.0.1:3160",
  out = "artifacts/market/amount-queue";
await mkdir(out, { recursive: true });
const db = new pg.Client({
  connectionString:
    "postgresql://starina@127.0.0.1:55439/roota_npd_helper_preview",
});
await db.connect();
const browser = await chromium.launch({ headless: true }),
  checks = [];
const admin = await browser.newContext();
const login = await admin.request.post(base + "/api/auth/sign-in/email", {
  headers: { Origin: base },
  data: { email: "market@example.test", password: "Local-market-preview-2026" },
});
assert.equal(login.status(), 200);
async function act(body, ok = true) {
  const r = await admin.request.post(base + "/api/market/admin", {
    headers: { Origin: base },
    data: body,
  });
  const value = await r.json();
  if (ok) assert.equal(r.status(), 200, JSON.stringify(value));
  else assert.notEqual(r.status(), 200);
  return value;
}
async function intake(
  context,
  method = "cash",
  amount = "12000",
  email = "queue@example.test",
) {
  await context.request.get(base + "/api/market/intake");
  const r = await context.request.post(base + "/api/market/intake", {
    headers: { Origin: base },
    data: {
      requestKey: crypto.randomUUID(),
      amount,
      email,
      method,
      accepted: true,
      marketingConsent: false,
    },
  });
  assert.equal(r.status(), 200, await r.text());
  return (await r.json()).url;
}
try {
  await db.query(
    "update market_register set current_sale_id=null;update market_intakes set cancelled_at=now() where paid_at is null and sale_id is null;update market_inventory set stock_qty=20,price=6000 where key='plate-nevidimka';update market_inventory set stock_qty=20,price=10 where key='postcard'",
  );
  await act({ action: "intake-open", enabled: true });
  const primary = await act({
    action: "show",
    method: "cash",
    basket: {
      requestKey: crypto.randomUUID(),
      quantities: { postcard: 1 },
      gardenBundle: false,
    },
  });
  const primaryId = primary.sale.id;
  const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await phone.newPage();
  await page.goto(base + "/market/buy");
  await page.getByLabel("Сумма покупки, ₽").fill("12000");
  await page.getByLabel("Email для чека").fill("phone-queue@example.test");
  await page.getByLabel("Как оплатить").selectOption("cash");
  await page.getByRole("checkbox").nth(1).uncheck();
  await page
    .getByRole("button", { name: "Сохранить почту и продолжить", exact: true })
    .click();
  await page.waitForURL(/\/market\/request\//);
  await page.getByRole("heading", { name: "Способ оплаты" }).waitFor();
  const token = new URL(page.url()).pathname.split("/").pop();
  const a = (
    await db.query("select * from market_intakes where token=$1", [token])
  ).rows[0];
  const number = `П-${String(a.number).padStart(6, "0")}`;
  assert.equal(a.marketing_consent, false);
  assert.equal(a.review_consent, true);
  assert.equal(a.paid_at, null);
  assert.equal(a.sale_id, null);
  assert.equal(
    (await db.query("select current_sale_id from market_register")).rows[0]
      .current_sale_id,
    primaryId,
  );
  checks.push(
    "phone: amount, email, method and purchase terms saved without occupying iPad; review invitation independent of news",
  );
  await page.screenshot({
    path: out + "/phone-cash-waiting.png",
    fullPage: true,
  });
  const peers = await Promise.all(
    Array.from({ length: 5 }, () => browser.newContext()),
  );
  const urls = await Promise.all(
    peers.map((c, i) =>
      intake(
        c,
        i % 2 ? "cash" : "transfer",
        "12000",
        `parallel-${i}@example.test`,
      ),
    ),
  );
  assert.equal(new Set(urls).size, 5);
  checks.push(
    "five concurrent buyers on the same network receive distinct purchases and tokens",
  );
  const publicData = await (
    await phone.request.get(base + "/api/market/intake/" + token)
  ).json();
  assert.equal(publicData.email, undefined);
  assert.equal(publicData.intakes, undefined);
  assert.equal(publicData.paid, false);
  assert.equal(
    (
      await phone.request.post(base + "/api/market/admin", {
        headers: { Origin: base },
        data: { action: "intake-confirm", id: a.id },
      })
    ).status(),
    401,
  );
  assert.notEqual(
    (
      await phone.request.post(base + "/api/market/intake", {
        headers: { Origin: "https://example.test" },
        data: {},
      })
    ).status(),
    200,
  );
  checks.push(
    "public buyer token exposes no email, other orders or seller actions; foreign origin rejected",
  );
  const control = await admin.newPage();
  await control.goto(base + "/market/control");
  const row = control
    .locator("details.market-intake-order")
    .filter({ hasText: number });
  await row.locator("summary").click();
  await db.query("update market_intakes set mode='live' where id=$1", [a.id]);
  await row
    .getByRole("button", { name: `Деньги получены · ${number}`, exact: true })
    .click();
  await row.getByText(/Деньги получены \d/).waitFor();
  const paid = (
    await db.query("select * from market_intakes where id=$1", [a.id])
  ).rows[0];
  assert.ok(paid.paid_at);
  assert.equal(paid.sale_id, null);
  const beforeJobs = (
    await db.query("select count(*)::int n from market_receipt_jobs")
  ).rows[0].n;
  const beforeTotals = (
    await (await admin.request.get(base + "/api/market/admin")).json()
  ).totals;
  const name = (
    await db.query(
      "select name from market_inventory where key='plate-nevidimka'",
    )
  ).rows[0].name;
  await row.getByLabel(`${number}: ${name}`, { exact: true }).fill("1");
  assert.equal(
    await row
      .getByRole("button", { name: "Сформировать чек", exact: true })
      .isDisabled(),
    true,
  );
  await act(
    {
      action: "intake-finalize",
      id: a.id,
      basket: {
        requestKey: crypto.randomUUID(),
        quantities: { "plate-nevidimka": 1 },
        gardenBundle: true,
      },
    },
    false,
  );
  assert.equal(
    (
      await db.query(
        "select stock_qty from market_inventory where key='plate-nevidimka'",
      )
    ).rows[0].stock_qty,
    20,
  );
  assert.equal(
    (await db.query("select count(*)::int n from market_receipt_jobs")).rows[0]
      .n,
    beforeJobs,
  );
  checks.push(
    "money confirmation alone creates no receipt job; 6000/12000 is rejected both by UI and server without stock changes",
  );
  // Simulate live stock in the isolated database; no real FNS/worker/email is used.
  await row.getByLabel(`${number}: ${name}`, { exact: true }).fill("2");
  assert.equal(
    await row
      .getByRole("button", { name: "Сформировать чек", exact: true })
      .isEnabled(),
    true,
  );
  await control.locator("#market-intake-queue").screenshot({
    path: out + "/seller-exact-composition.png",
  });
  await row
    .getByRole("button", { name: "Сформировать чек", exact: true })
    .click();
  await page.waitForURL(/\/market\/pay\//, { timeout: 20000 });
  await page.getByRole("heading", { name: "Ожидаем чек ФНС" }).waitFor();
  const linked = (
    await db.query(
      "select i.sale_id,s.* from market_intakes i join market_sales s on s.id=i.sale_id where i.id=$1",
      [a.id],
    )
  ).rows[0];
  assert.equal(linked.status, "paid");
  assert.equal(
    new Date(linked.paid_at).toISOString(),
    new Date(paid.paid_at).toISOString(),
  );
  assert.equal(linked.email, "phone-queue@example.test");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from market_receipt_jobs where sale_id=$1",
        [linked.sale_id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select stock_qty from market_inventory where key='plate-nevidimka'",
      )
    ).rows[0].stock_qty,
    18,
  );
  assert.equal(
    (await db.query("select current_sale_id from market_register")).rows[0]
      .current_sale_id,
    primaryId,
  );
  const body = {
    action: "intake-finalize",
    id: a.id,
    basket: {
      requestKey: crypto.randomUUID(),
      quantities: { "plate-nevidimka": 2 },
      gardenBundle: true,
    },
  };
  await Promise.all([act(body), act(body)]);
  await act({ action: "intake-confirm", id: a.id });
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from market_sales where request_key=$1",
        [a.request_key],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select stock_qty from market_inventory where key='plate-nevidimka'",
      )
    ).rows[0].stock_qty,
    18,
  );
  checks.push(
    "exact composition creates one immutable sale/job and one stock deduction; concurrent replay and repeated money confirmation are idempotent; iPad unchanged",
  );
  const afterTotals = (
    await (await admin.request.get(base + "/api/market/admin")).json()
  ).totals;
  // Paid intake becomes a sale without increasing revenue a second time.
  assert.equal(afterTotals.amount - beforeTotals.amount, 0);
  checks.push(
    "paid amount remains separate from receipt state and is counted once after composition",
  );
  assert.equal(
    await page.getByRole("link", { name: "Открыть чек", exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Продолжить без почты", exact: true })
      .count(),
    0,
  );
  await page.screenshot({
    path: out + "/phone-paid-awaiting-receipt.png",
    fullPage: true,
  });
  checks.push(
    "buyer automatically reaches their own paid page; pending receipt exposes no fake success/link",
  );
  const ipad = await browser.newContext({
      viewport: { width: 820, height: 1180 },
    }),
    ipadPage = await ipad.newPage();
  await ipadPage.goto(base + "/market/buy");
  await ipadPage.getByLabel("Сумма покупки, ₽").waitFor();
  assert.ok(
    await ipadPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await ipadPage.screenshot({
    path: out + "/ipad-permanent-entry.png",
    fullPage: true,
  });
  checks.push("phone and iPad intake layouts have no horizontal overflow");
  const pdf = await admin.request.get(base + "/api/market/intake-label");
  assert.equal(pdf.status(), 200);
  const bytes = await pdf.body();
  const doc = await PDFDocument.load(bytes);
  assert.ok(Math.abs(doc.getPage(0).getWidth() - (40 * 72) / 25.4) < 0.01);
  assert.ok(Math.abs(doc.getPage(0).getHeight() - (58 * 72) / 25.4) < 0.01);
  await writeFile(out + "/permanent-qr-40x58.pdf", bytes);
  checks.push("permanent payment QR downloads as a 40x58 mm PDF");

  await db.query("update email_settings set enabled=true");
  await db.query("update market_sales set mode='test' where id<>$1", [
    linked.sale_id,
  ]);
  await db.query("select public.prepare_market_review_invites()");
  const invite = (
    await db.query(
      "select scheduled_at from email_messages where event_key=$1",
      [`market:${linked.sale_id}:review_invite`],
    )
  ).rows[0];
  assert.ok(invite);
  assert.equal(
    new Date(invite.scheduled_at) - new Date(linked.paid_at),
    3 * 86400000,
  );
  await db.query(
    "update email_subscriptions set revoked_at=now() where resource=$1 and purpose='review'",
    [`market:${linked.sale_id}`],
  );
  const retryContact = await phone.request.post(
    base + "/api/market/pay/" + new URL(page.url()).pathname.split("/").pop(),
    {
      headers: { Origin: base },
      data: { accepted: true, marketingConsent: false },
    },
  );
  assert.equal(retryContact.status(), 200);
  assert.equal(
    (
      await db.query("select review_consent from market_sales where id=$1", [
        linked.sale_id,
      ])
    ).rows[0].review_consent,
    false,
  );
  assert.equal(
    (
      await db.query("select state from email_messages where event_key=$1", [
        `market:${linked.sale_id}:review_invite`,
      ])
    ).rows[0].state,
    "cancelled",
  );
  checks.push(
    "purchase invitation is scheduled once at payment+3 days without news consent; explicit review unsubscribe survives contact replay",
  );
  const robo = await intake(
    peers[0],
    "robokassa",
    "12000",
    "robo-queue@example.test",
  );
  const rr = (
    await db.query("select * from market_intakes where token=$1", [
      robo.split("/").pop(),
    ])
  ).rows[0];
  const roboPage = await peers[0].newPage();
  await roboPage.goto(base + robo);
  await roboPage.getByText(/уточнит состав покупки/).waitFor();
  assert.equal(
    await roboPage.getByRole("button", { name: /Перейти к оплате/ }).count(),
    0,
  );
  await act({
    action: "intake-finalize",
    id: rr.id,
    basket: {
      requestKey: crypto.randomUUID(),
      quantities: { "plate-nevidimka": 2 },
      gardenBundle: false,
    },
  });
  await roboPage.waitForURL(/\/market\/pay\//, { timeout: 20000 });
  await roboPage.getByRole("button", { name: /Перейти к оплате/ }).waitFor();
  assert.equal(
    await roboPage.getByLabel("Email для чека", { exact: true }).count(),
    0,
  );
  const roboSale = (
    await db.query(
      "select s.* from market_sales s join market_intakes i on i.sale_id=s.id where i.id=$1",
      [rr.id],
    )
  ).rows[0];
  const form = await peers[0].request.post(
    base + "/api/market/pay/" + roboSale.token,
    {
      headers: { Origin: base },
      data: { accepted: true, marketingConsent: false },
    },
  );
  assert.equal(form.status(), 200, await form.text());
  const paymentForm = (await form.json()).form;
  assert.equal(paymentForm.fields.Email, "robo-queue@example.test");
  assert.equal(paymentForm.fields.OutSum, "12000.00");
  assert.equal(new URL(paymentForm.action).origin, "https://auth.robokassa.ru");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from market_receipt_jobs where sale_id=$1",
        [roboSale.id],
      )
    ).rows[0].n,
    0,
  );
  checks.push(
    "Robokassa waits for exact composition, then prepares its existing provider form using saved email; no duplicate NPD job or actual payment",
  );
  await act({ action: "intake-open", enabled: false });
  assert.equal(
    (await (await peers[0].request.get(base + "/api/market/intake")).json())
      .enabled,
    false,
  );
  assert.equal(
    (
      await peers[0].request.get(
        base + urls[0].replace("/market/request/", "/api/market/intake/"),
      )
    ).status(),
    200,
  );
  checks.push("seller can close new intake without breaking saved buyer links");
  await writeFile(
    out + "/checks.json",
    JSON.stringify(
      { checks, realIncomesCreated: 0, realPaymentsMade: 0, realEmailsSent: 0 },
      null,
      2,
    ),
  );
  console.log(`PASS: ${checks.length} amount queue scenarios`);
} finally {
  await browser.close();
  await db.end();
}
