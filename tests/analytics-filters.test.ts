import test from "node:test";
import assert from "node:assert/strict";
import { parseAnalyticsFilters } from "../lib/analytics/filters";

test("analytics filters support old links, repeated products and inclusive date ranges", () => {
  const id = "83ebeba3-43eb-4761-81e9-6dad11d7835e";
  assert.deepEqual(parseAnalyticsFilters({}), {
    days: 30,
    products: [],
    start: "",
    end: "",
  });
  assert.deepEqual(parseAnalyticsFilters({ days: "7", product: id }).products, [
    id,
  ]);
  assert.deepEqual(
    parseAnalyticsFilters({
      product: [id, id],
      start: "2026-10-22",
      end: "2026-10-23",
    }),
    { days: 30, products: [id], start: "2026-10-22", end: "2026-10-23" },
  );
  for (const params of [
    { start: "2026-02-30", end: "2026-03-01" },
    { start: "2026-10-23", end: "2026-10-22" },
    { start: "2026-10-22" },
    { end: "2026-10-22" },
    { start: ["2026-10-22", "2026-10-23"], end: "2026-10-24" },
    { product: "invalid" },
  ])
    assert.throws(() => parseAnalyticsFilters(params));
});
