import { test } from "node:test";
import assert from "node:assert/strict";
import { bindPrepositions } from "../lib/typography";

test("keeps Russian prepositions and consecutive short words with their phrase", () => {
  assert.equal(
    bindPrepositions("Доставка в пункт и на дом"),
    "Доставка в\u00a0пункт и\u00a0на\u00a0дом",
  );
  assert.equal(
    bindPrepositions("В корзину — для дома"),
    "В\u00a0корзину — для\u00a0дома",
  );
});
test("does not alter word fragments, paragraph breaks or existing nonbreaking spaces", () => {
  assert.equal(bindPrepositions("керамика слово окно"), "керамика слово окно");
  assert.equal(
    bindPrepositions("О студии\n\nС любовью"),
    "О\u00a0студии\n\nС\u00a0любовью",
  );
  assert.equal(bindPrepositions("в\u00a0доме"), "в\u00a0доме");
  assert.equal(bindPrepositions(null), null);
});
