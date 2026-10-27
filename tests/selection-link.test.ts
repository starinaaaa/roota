import test from "node:test";
import assert from "node:assert/strict";
import { encodeSelection, decodeSelection } from "../lib/favorites";
test("a shared selection preserves product and custom Garden composition", () => {
  const items = [
    {
      productId: "8f3685d7-a0fe-40ee-99aa-f36aa1138886",
      configuration: { size: 0 as const, stems: 9, flowers: 3, leaves: 2 },
    },
  ];
  const params = new URLSearchParams(`items=${encodeSelection(items)}`);
  assert.deepEqual(decodeSelection(params.get("items")!), items);
});
test("shared links reject malformed, oversized and invalid product data", () => {
  for (const value of [
    undefined,
    "[]",
    "{",
    "x".repeat(16001),
    JSON.stringify([{ productId: "invalid" }]),
    JSON.stringify([
      {
        productId: "8f3685d7-a0fe-40ee-99aa-f36aa1138886",
        configuration: { size: 0, stems: -1, flowers: 0, leaves: 0 },
      },
    ]),
  ])
    assert.equal(decodeSelection(value), null);
});
