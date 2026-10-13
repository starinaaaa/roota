import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedRequestOrigin } from "../lib/request-origin";

function request(origin?: string, url = "http://container:3000/api/delivery") {
  return new Request(url, {
    headers: origin ? { Origin: origin } : {},
  });
}

test("accepts the public HTTPS origin behind a reverse proxy", () => {
  assert.equal(
    isTrustedRequestOrigin(
      request("https://roota.moscow"),
      "https://roota.moscow/",
    ),
    true,
  );
});

test("rejects foreign, internal, insecure, opaque and missing origins", () => {
  for (const origin of [
    "https://attacker.example",
    "https://roota.moscow.attacker.example",
    "http://container:3000",
    "http://roota.moscow",
    "https://roota.moscow/path",
    "null",
    undefined,
  ]) {
    assert.equal(
      isTrustedRequestOrigin(request(origin), "https://roota.moscow"),
      false,
      String(origin),
    );
  }
});

test("forwarded headers cannot expand the trusted origins", () => {
  const incoming = request("https://attacker.example");
  incoming.headers.set("x-forwarded-host", "attacker.example");
  incoming.headers.set("x-forwarded-proto", "https");
  assert.equal(isTrustedRequestOrigin(incoming, "https://roota.moscow"), false);
});

test("uses the request origin locally without a configured site URL", () => {
  assert.equal(
    isTrustedRequestOrigin(
      request("http://localhost:3000", "http://localhost:3000/api/orders"),
      "",
    ),
    true,
  );
  assert.equal(
    isTrustedRequestOrigin(
      request("https://attacker.example", "http://localhost:3000/api/orders"),
      "",
    ),
    false,
  );
});

test("invalid site configuration fails closed", () => {
  for (const siteUrl of ["not a URL", "javascript:alert(1)"]) {
    assert.equal(
      isTrustedRequestOrigin(request("https://roota.moscow"), siteUrl),
      false,
    );
  }
});
