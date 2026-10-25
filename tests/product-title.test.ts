import { gardenProductTitle } from "../lib/garden-title";
import test from "node:test";
import assert from "node:assert/strict";
import { productTitle } from "../lib/product-title";
import { renderEmail } from "../lib/email/templates";

test("category names are singular and existing descriptive titles are preserved", () => {
  assert.equal(
    productTitle("Невидимка", { slug: "plates" }),
    "Тарелка «Невидимка»",
  );
  assert.equal(productTitle('"Лес"', { slug: "glasses" }), "Стакан «Лес»");
  assert.equal(productTitle("Ваза «Лес»", { slug: "vases" }), "Ваза «Лес»");
  assert.equal(productTitle("Без категории"), "Без категории");
  assert.equal(productTitle("Сад — Тайный сад (стебли: 6, цветочки: 3, листочки: 3)", { slug: "objects", name: "Объекты" }), "Сад — Тайный сад (стебли: 6, цветочки: 3, листочки: 3)");
});
test("purchase email renders category title and photo in HTML and title in plain text", () => {
  const name = productTitle("Лес <3>", { slug: "plates" });
  const email = renderEmail(
    { subject: "Покупка", body: "Спасибо!" },
    { number: "DEMO", items: `${name} × 1`, total: "6000" },
    "https://roota.moscow",
    "Открыть",
    undefined,
    true,
    [
      {
        name,
        quantity: 1,
        price: 6000,
        imageUrl: "https://roota.moscow/media/demo/photo",
      },
    ],
  );
  assert.match(email.html, /Тарелка «Лес &lt;3&gt;»/);
  assert.match(
    email.html,
    /<img src="https:\/\/roota.moscow\/media\/demo\/photo"/,
  );
  assert.match(email.plaintext, /Тарелка «Лес <3>»/);
});

test("garden display titles retain the frozen bundle name and avoid repeating the type", () => {
  const legacy = "Сад — Садовый дворик (стебли: 6, цветочки: 3, листочки: 3)";
  const title = "Керамический конструктор «Сад» — Садовый дворик (стебли: 6, цветочки: 3, листочки: 3)";
  assert.equal(gardenProductTitle(legacy), title);
  assert.equal(gardenProductTitle(title), title);
});
