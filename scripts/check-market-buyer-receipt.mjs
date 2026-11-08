// Local-only UI checks. Install Playwright separately or provide PLAYWRIGHT_MODULE.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium, devices } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.ROOTA_TEST_URL ?? "http://127.0.0.1:3163";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("LOCAL_TEST_SERVER_REQUIRED");
const out = "artifacts/market/buyer-receipt";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
const token = "b".repeat(64),
  receipt =
    "https://lknpd.nalog.ru/api/v1/receipt/773212983545/local-fixture/print";
try {
  for (const device of ["iPhone 13", "iPad Mini"]) {
    const context = await browser.newContext({ ...devices[device] });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    let sale, posted;
    let failPoll = false;
    await page.route("**/api/market/pay/" + token, (route) => {
      if (failPoll) return route.abort();
      if (route.request().method() === "POST") {
        posted = route.request().postDataJSON();
        sale.emailSaved = true;
        sale.receiptEmailState = "pending";
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ saved: true }),
        });
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(sale),
      });
    });
    const set = (extra = {}) => {
      sale = {
        id: "00000000-0000-4000-8000-000000000001",
        number: "М-000031",
        method: "cash",
        mode: "live",
        status: "paid",
        amount: 10,
        items: [{ name: "Открытка", quantity: 1, sum: 10, kind: "goods" }],
        expiresAt: "2020-01-01T00:00:00Z",
        paidAt: new Date().toISOString(),
        receiptUrl: null,
        receiptStatus: "queued",
        receiptRegisteredAt: null,
        emailSaved: true,
        receiptEmailState: null,
        ...extra,
      };
    };
    set();
    await page.goto(base + "/market/pay/" + token);
    await page.getByRole("heading", { name: "Ожидаем чек ФНС" }).waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "Открыть чек", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page.getByLabel("Email для чека", { exact: true }).count(),
      0,
    );
    await page.screenshot({
      path:
        out +
        "/" +
        (device === "iPhone 13" ? "phone" : "ipad") +
        "-waiting.png",
      fullPage: true,
    });
    checks.push(
      device + ": paid state survives reload; pending receipt has no fake URL",
    );
    sale.receiptStatus = "registered";
    sale.receiptUrl = receipt;
    sale.receiptEmailState = "pending";
    await page
      .getByRole("link", { name: "Открыть чек", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "Открыть чек", exact: true })
        .getAttribute("href"),
      "/api/market/pay/" + token + "/receipt",
    );
    assert.ok(
      await page
        .getByText("Отправляем чек на вашу почту.", { exact: true })
        .isVisible(),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path:
        out + "/" + (device === "iPhone 13" ? "phone" : "ipad") + "-ready.png",
      fullPage: true,
    });
    checks.push(
      device +
        ": confirmed receipt appears by polling with original and PDF links",
    );
    failPoll = true;
    await page.getByText(/Восстанавливаем связь/).waitFor();
    assert.ok(
      await page
        .getByRole("link", { name: "Открыть чек", exact: true })
        .isVisible(),
    );
    failPoll = false;
    checks.push(
      device +
        ": temporary disconnect preserves paid state and verified receipt",
    );
    set({ receiptStatus: "uncertain" });
    await page.reload();
    await page
      .getByRole("heading", { name: "Проверяем выдачу чека" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "Открыть чек", exact: true })
        .count(),
      0,
    );
    checks.push(
      device +
        ": uncertain receipt gives seller guidance without false success",
    );
    set({
      receiptStatus: "registered",
      receiptUrl: receipt,
      emailSaved: false,
    });
    await page.reload();
    await page.getByLabel("Email для чека", { exact: true }).waitFor();
    assert.ok(
      await page
        .getByRole("link", { name: "Открыть чек", exact: true })
        .isVisible(),
    );
    await page.locator("input[name=marketingConsent]").uncheck();
    await page
      .getByLabel("Email для чека", { exact: true })
      .fill("buyer@example.test");
    await page
      .getByRole("button", { name: "Получить чек на почту", exact: true })
      .click();
    await page
      .getByText("Отправляем чек на вашу почту.", { exact: true })
      .waitFor();
    assert.equal(posted.email, "buyer@example.test");
    assert.equal(posted.accepted, true);
    assert.equal(posted.marketingConsent, false);
    assert.equal(posted.reviewConsent, undefined);
    await page.reload();
    await page
      .getByRole("link", { name: "Открыть чек", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Email для чека", { exact: true }).count(),
      0,
    );
    checks.push(
      device +
        ": email can be saved after issuance without news consent, and stays saved on reload",
    );
    sale.receiptEmailState = "failed";
    await page.getByText(/Не удалось подтвердить доставку письма/).waitFor();
    assert.ok(
      await page
        .getByRole("link", { name: "Открыть чек", exact: true })
        .isVisible(),
    );
    checks.push(device + ": email failure retains receipt access");
    set({ method: "robokassa", receiptStatus: "provider" });
    await page.reload();
    await page
      .getByText("Чек по оплате через Робокассу придёт на вашу почту.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "Открыть чек", exact: true })
        .count(),
      0,
    );
    checks.push(device + ": Robokassa stays with provider receipt flow");
    await context.close();
  }
  await writeFile(
    out + "/checks.json",
    JSON.stringify(
      { checks, realEmailsSent: 0, realIncomesCreated: 0 },
      null,
      2,
    ),
  );
  console.log("PASS " + checks.length + " buyer page scenarios");
} finally {
  await browser.close();
}
