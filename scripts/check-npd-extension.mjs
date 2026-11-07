const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
import pg from "pg";
import { mkdtemp, cp, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fnsTask } from "../extensions/roota-npd/fns-adapter.mjs";
await fetch("http://127.0.0.1:3161/fixture-mode?lost=0");
const base = "http://127.0.0.1:3160",
  out = "artifacts/market/npd-result";
await (await import("node:fs/promises")).mkdir(out, { recursive: true });
const dir = await mkdtemp("/tmp/roota-npd-extension-");
await cp("extensions/roota-npd", dir, { recursive: true });
const manifest = JSON.parse(await readFile(dir + "/manifest.json", "utf8"));
manifest.host_permissions = [
  "http://127.0.0.1:3160/*",
  "http://127.0.0.1:3161/*",
];
await writeFile(dir + "/manifest.json", JSON.stringify(manifest));
await writeFile(
  dir + "/config.mjs",
  `export const config={roota:'${base}',fns:'http://127.0.0.1:3161',formPath:'/sales/create',liveCertified:true};`,
);
const context = await chromium.launchPersistentContext(
  await mkdtemp("/tmp/roota-npd-profile-"),
  {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
    viewport: { width: 1200, height: 950 },
  },
);
let worker =
  context.serviceWorkers()[0] ??
  (await context.waitForEvent("serviceworker", { timeout: 30000 }));
const id = new URL(worker.url()).host;
const popup = await context.newPage();
popup.setDefaultTimeout(60000);
popup.setDefaultNavigationTimeout(120000);
await popup.goto(`chrome-extension://${id}/popup.html`);
const admin = await context.request.post(base + "/api/auth/sign-in/email", {
  data: { email: "market@example.test", password: "Local-market-preview-2026" },
  headers: { Origin: base },
  timeout: 120000,
});
assert.equal(admin.status(), 200);
const db = new pg.Client({
  connectionString:
    "postgresql://starina@127.0.0.1:55439/roota_npd_helper_preview",
});
await db.connect();
await db.query(
  "update market_register set current_sale_id=null; update market_receipt_jobs set state='failed',helper_id=null,last_error='Excluded cloned local fixture'",
);
await db.query(
  "insert into email_templates(kind,subject,body) values('market_receipt','Чек','Чек') on conflict do nothing",
);
const checks = [];
const ok = (s) => checks.push(s);
async function action(body) {
  const r = await context.request.post(base + "/api/market/admin", {
    headers: { Origin: base },
    data: body,
    timeout: 120000,
  });
  const v = await r.json();
  assert.equal(r.status(), 200, JSON.stringify(v));
  return v;
}
async function connect() {
  const r = await action({
    action: "helper-create",
    name: "Isolated extension test",
    extensionId: id,
  });
  await popup.locator("#credential").fill(r.helperCredential.token);
  await popup.locator("#connect").click();
  await popup.getByText("Подключён к Roota", { exact: false }).waitFor();
  return r.helperCredential;
}
async function newSale(mode = "test") {
  await action({ action: "clear" });
  const s = await action({
    action: "show",
    method: "cash",
    basket: {
      requestKey: crypto.randomUUID(),
      quantities: { "plate-potseluy": 2 },
      gardenBundle: false,
    },
  });
  if (mode === "live")
    await db.query(
      "update market_sales set mode='live',email='npd-buyer@example.test' where id=$1",
      [s.sale.id],
    );
  await action({ action: "confirm-manual", id: s.sale.id });
  return s.sale;
}
try {
  const credential = await connect();
  const sale = await newSale();
  const concurrent = await context.newPage();
  await concurrent.goto(`chrome-extension://${id}/popup.html`);
  await concurrent.getByText("Подключён к Roota", { exact: false }).waitFor();
  await Promise.all([
    popup.locator("#preview").click(),
    concurrent.locator("#preview").click(),
  ]);
  await popup
    .getByText("Проверено. Доход НЕ зарегистрирован", { exact: false })
    .first()
    .waitFor({ timeout: 120000 });
  const form = context
    .pages()
    .find((p) => p.url().startsWith("http://127.0.0.1:3161"));
  assert.ok(form);
  assert.equal(await form.evaluate(() => window.testIssueCount), 0);
  assert.equal(await form.locator("#issue").isDisabled(), true);
  await form.locator("#issue").dispatchEvent("click");
  assert.equal(await form.evaluate(() => window.testIssueCount), 0);
  assert.equal(await form.locator('input[name$=".name"]').count(), 2);
  assert.equal(await form.locator("#total").innerText(), "12000.00 ₽");
  const saved = (
    await db.query(
      "select s.status,s.receipt_url,j.state,j.previewed_at from market_sales s join market_receipt_jobs j on j.sale_id=s.id where s.id=$1",
      [sale.id],
    )
  ).rows[0];
  assert.equal(saved.status, "paid");
  assert.equal(saved.receipt_url, null);
  assert.equal(saved.state, "queued");
  assert.ok(saved.previewed_at);
  ok(
    "real MV3 worker: Roota paid job -> FNS fixture form -> verified preview; zero submit clicks and no issued status",
  );
  await concurrent.close();
  ok("parallel popup tabs share one in-flight task");
  await form.screenshot({
    path: out + "/fixture-safe-form.png",
    fullPage: true,
  });
  await popup.screenshot({
    path: out + "/extension-safe-status.png",
    fullPage: true,
  });
  await form.close();
  await popup.locator("#draft-closed").check();
  await popup.locator("#clear").click();
  // Independent browser requests cannot claim with another extension origin.
  const denied = await context.request.post(base + "/api/market/helper", {
    headers: {
      Authorization: `Bearer ${credential.token}`,
      Origin: "https://evil.example",
    },
    data: { action: "claim" },
    timeout: 120000,
  });
  assert.equal(denied.status(), 401);
  ok("credential is bound to the declared extension origin");
  await action({ action: "helper-revoke", id: credential.id });
  const revoked = await context.request.post(base + "/api/market/helper", {
    headers: { Authorization: `Bearer ${credential.token}` },
    data: { action: "heartbeat" },
    timeout: 120000,
  });
  assert.equal(revoked.status(), 401);
  ok("server revocation blocks further helper requests");
  // Live issuance is simulated ONLY on the local test UI. Production config remains liveCertified:false.
  await popup.locator("#disconnect").click();
  const second = await connect();
  const previewPlan = (
    await worker.evaluate(() => chrome.storage.local.get("active"))
  ).active.plan;
  const fixtureResponse = await fetch("http://127.0.0.1:3161/fixture-receipt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      date: previewPlan.date.split("-").reverse().join("."),
      rows: previewPlan.rows.map((r) => ({
        name: r.name,
        price: (r.kopecks / 100).toFixed(2),
      })),
    }),
  });
  const fixtureId = fixtureResponse.headers.get("x-fixture-id"),
    fixtureUrl = fixtureResponse.headers.get("x-fixture-url");
  assert.ok(fixtureId);
  assert.ok(fixtureUrl);
  await action({
    action: "receipt",
    id: sale.id,
    url: fixtureUrl,
    registeredAt: new Date().toISOString(),
  });
  const existingReceipt = await context.newPage();
  await existingReceipt.goto(
    "http://127.0.0.1:3161/sales/create?existing=" + fixtureId,
  );
  await existingReceipt
    .getByRole("heading", { name: "Чек", exact: true })
    .waitFor();
  await popup.locator("#inspect").click();
  await popup.getByText("Результат ФНС проверен", { exact: false }).waitFor();
  assert.ok(
    (
      await db.query(
        "select result_verified_at from market_receipt_helpers where id=$1",
        [second.id],
      )
    ).rows[0].result_verified_at,
  );
  await existingReceipt.close();
  ok(
    "read-only MV3 QR/fingerprint/OCR inspection certifies the device without a submit click",
  );

  const live = await newSale("live");
  await action({
    action: "helper-mode",
    id: second.id,
    scope: "trial",
    saleId: live.id,
    acknowledged: true,
  });
  await popup.locator("#arm").click();
  await worker.evaluate(() =>
    chrome.alarms.create("roota-helper", { when: Date.now() + 200 }),
  );
  await popup.getByText("Подключён к Roota").waitFor();
  for (let i = 0; i < 90; i++) {
    const r = (
      await db.query("select state from market_receipt_jobs where sale_id=$1", [
        live.id,
      ])
    ).rows[0];
    if (r?.state === "registered") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const liveJob = (
    await db.query("select * from market_receipt_jobs where sale_id=$1", [
      live.id,
    ])
  ).rows[0];
  assert.equal(liveJob.state, "registered");
  const issued = context
    .pages()
    .find((p) => p.url().startsWith("http://127.0.0.1:3161"));
  assert.equal(await issued.evaluate(() => window.testIssueCount), 1);
  ok(
    "simulated live: server one-time fence -> single DOM submit -> verified original link -> paid sale updated",
  );
  const state = await worker.evaluate(() => chrome.storage.local.get("active"));
  assert.equal(state.active.phase, "completed");
  const repeated = await context.request.post(base + "/api/market/helper", {
    headers: { Authorization: "Bearer " + second.token },
    data: {
      action: "result",
      id: live.id,
      token: state.active.job.claim_token,
      digest: state.active.digest,
      ...state.active.evidence,
    },
    timeout: 120000,
  });
  assert.equal(repeated.status(), 200);
  assert.equal((await repeated.json()).state, "registered");
  ok(
    "repeated identical HTTP result returns the existing receipt without a new registration",
  );

  await worker.evaluate(
    (active) =>
      chrome.storage.local.set({
        active: { ...active, phase: "result_pending" },
      }),
    state.active,
  );
  const cdp = await context.newCDPSession(popup);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await popup.locator("#recover").click();
  await popup
    .getByText("Оригинальный чек сохранён в Roota", { exact: false })
    .first()
    .waitFor();
  await popup.reload();
  assert.equal(await issued.evaluate(() => window.testIssueCount), 1);
  ok(
    "actual MV3 service worker stop/restart and result replay do not submit again",
  );
  await action({ action: "show-receipt", id: live.id });
  const r = (
    await db.query("select current_sale_id from market_register where id=1")
  ).rows[0];
  assert.equal(r.current_sale_id, live.id);
  ok("original receipt can be explicitly restored to the current iPad screen");
  assert.equal(
    (
      await db.query(
        "select * from email_messages where kind='market_receipt' and payload->>'market_sale_id'=$1",
        [live.id],
      )
    ).rows.length,
    1,
  );
  ok(
    "one transactional receipt email is queued, independent of marketing consent",
  );
  const download = await context.request.get(
    base + `/api/market/receipt/${live.id}?format=label`,
    { timeout: 120000 },
  );
  assert.equal(download.status(), 200);
  await writeFile(out + "/fixture-label-40x58.pdf", await download.body());
  ok("same verified receipt downloads as a 40x58 label");
  await popup.locator("#pause").click();
  await fetch("http://127.0.0.1:3161/fixture-mode?lost=1");
  const lost = await newSale("live");
  await action({
    action: "helper-mode",
    id: second.id,
    scope: "trial",
    saleId: lost.id,
    acknowledged: true,
  });
  await popup.locator("#arm").click();
  worker = context.serviceWorkers()[0];
  await worker.evaluate(() =>
    chrome.alarms.create("roota-helper", { when: Date.now() + 200 }),
  );
  for (let i = 0; i < 150; i++) {
    const r = (
      await db.query("select state from market_receipt_jobs where sale_id=$1", [
        lost.id,
      ])
    ).rows[0];
    if (r?.state === "uncertain") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(
    (
      await db.query("select state from market_receipt_jobs where sale_id=$1", [
        lost.id,
      ])
    ).rows[0].state,
    "uncertain",
  );
  const lostTab = context
    .pages()
    .filter((p) => p.url().startsWith("http://127.0.0.1:3161"))
    .at(-1);
  assert.equal(await lostTab.evaluate(() => window.testIssueCount), 1);
  await popup.reload();
  await popup.locator("#recover").click();
  await popup
    .getByText("Однозначный чек не найден", { exact: false })
    .waitFor();
  assert.equal(await lostTab.evaluate(() => window.testIssueCount), 1);
  ok(
    "missing FNS confirmation becomes uncertain; recovery never clicks submit again",
  );
  assert.equal(
    (
      await db.query(
        "select receipt_url,status from market_sales where id=$1",
        [lost.id],
      )
    ).rows[0].receipt_url,
    null,
  );
  assert.equal(
    (await db.query("select status from market_sales where id=$1", [lost.id]))
      .rows[0].status,
    "paid",
  );
  ok("uncertain receipt leaves money paid and exposes no fake receipt URL");
  await popup.screenshot({
    path: out + "/extension-uncertain-status.png",
    fullPage: true,
  });
  await fetch("http://127.0.0.1:3161/fixture-mode?lost=0");
  const changed = await context.newPage();
  await changed.goto("http://127.0.0.1:3161/sales/create");
  await changed
    .locator("label")
    .first()
    .evaluate((e) => (e.textContent = "Изменённое поле ФНС"));
  const bad = await changed.evaluate(fnsTask, {
    action: "fill",
    safe: true,
    plan: state.active.plan,
  });
  assert.equal(bad.ok, false);
  assert.equal(await changed.evaluate(() => window.testIssueCount), 0);
  ok("changed FNS labels stop before registration");
  await changed.setContent('<input type="password"><h1>Вход</h1>');
  const loginResult = await changed.evaluate(fnsTask, {
    action: "fill",
    safe: true,
    plan: state.active.plan,
  });
  assert.equal(loginResult.code, "LOGIN_REQUIRED");
  ok("logged-out FNS stops with login-required status");
  await writeFile(
    out + "/extension-checks.json",
    JSON.stringify(
      {
        checks,
        productionConfigLiveCertified: true,
        deviceResultVerificationRequired: true,
        realIncomesCreated: 0,
        realEmailsSent: 0,
        testExtensionId: id,
        extensionTestPath: dir,
      },
      null,
      2,
    ),
  );
  console.log("PASS: " + checks.length + " real MV3 extension checks");
} catch (e) {
  const debug = await worker.evaluate(async () => {
    const s = await chrome.storage.local.get(["active", "lastError"]);
    return {
      phase: s.active?.phase,
      evidence: s.active?.evidence,
      plan: s.active?.plan,
      error: s.lastError,
    };
  });
  await writeFile(
    "/tmp/roota-npd-v2-debug-evidence.json",
    JSON.stringify(debug),
  );
  console.error(
    "LAST_ERROR",
    await worker.evaluate(async () => {
      const s = await chrome.storage.local.get("lastError");
      return s.lastError;
    }),
  );
  throw e;
} finally {
  await context.close();
  await db.end();
}
