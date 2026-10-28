import test from "node:test";
import assert from "node:assert/strict";
import { estimatedReadyLabel, productionEstimate } from "../lib/preorder-copy";
import { plannedReadyDate, readyDateLabel } from "../lib/production";
import { customerOrderState } from "../lib/customer-order-model";

test("public preorder duration handles weeks, other lead times and unknown plans", () => {
  assert.equal(productionEstimate(21), "примерно 3 недели");
  assert.equal(productionEstimate(7), "примерно 1 неделя");
  assert.equal(productionEstimate(35), "примерно 5 недель");
  assert.equal(productionEstimate(11), "примерно 11 дней");
  assert.equal(productionEstimate(22), "примерно 22 дня");
  for (const days of [null, undefined, 0, -1, NaN, Infinity])
    assert.equal(productionEstimate(days), "срок уточним со студией");
});

test("public readiness is an estimate while the admin date remains exact", () => {
  const ready = plannedReadyDate("2026-10-28T12:00:00Z", 21)!;
  assert.equal(ready, "2026-11-18");
  assert.equal(
    estimatedReadyLabel(ready),
    "примерно 18 ноября, но постараемся быстрее",
  );
  assert.match(readyDateLabel(ready), /18 ноября 2026/);
  assert.equal(
    estimatedReadyLabel("2026-11-17T22:30:00Z"),
    "примерно 18 ноября, но постараемся быстрее",
  );
  const state = customerOrderState({
    status: "in_production",
    payment_status: "paid",
    hasPreorder: true,
    readyOn: ready,
    leadTimeDays: 21,
  });
  assert.match(state.detail, /примерно 18 ноября, но постараемся быстрее/);
  assert.doesNotMatch(state.detail, /2026|Плановая готовность/);
});
