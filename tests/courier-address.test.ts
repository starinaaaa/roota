import test from "node:test";
import assert from "node:assert/strict";
import {
  joinCourierAddress,
  splitCourierAddress,
} from "../lib/courier-address";

test("saved courier addresses restore without duplication and keep apartments out of suggestions", () => {
  const saved = "г Москва, ул Яблочкова, д 49, кв. 436";
  const { address, apartment } = splitCourierAddress(saved);
  assert.equal(address, "г Москва, ул Яблочкова, д 49");
  assert.equal(apartment, "436");
  assert.equal(joinCourierAddress(address, apartment), saved);
  assert.deepEqual(splitCourierAddress("Москва, Ленина 1, офис 12"), {
    address: "Москва, Ленина 1",
    apartment: "12",
  });
  assert.deepEqual(splitCourierAddress("Москва, Ленина 1"), {
    address: "Москва, Ленина 1",
    apartment: "",
  });
  assert.equal(joinCourierAddress(address, ""), address);
});
