import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "pg-connection-string";
import { databaseConnectionUrl } from "../lib/db/connection";

test("separate database password survives all URL reserved characters", () => {
  const password = 'dummy:&?#/%@+^<>="$\\';
  const url = databaseConnectionUrl({
    DATABASE_URL: "postgresql://roota_app@db.example.invalid/shop",
    DATABASE_PASSWORD_BASE64: Buffer.from(password).toString("base64"),
  });
  const parsed = parse(url.toString());
  assert.equal(parsed.password, password);
  assert.equal(parsed.host, "db.example.invalid");
  assert.equal(parsed.database, "shop");
});
test("existing encoded URLs still work and cannot override TLS verification", () => {
  const url = databaseConnectionUrl({
    DATABASE_URL:
      "postgresql://app:dummy%23%3C@db.example.invalid/shop?sslmode=no-verify&ssl=false&application_name=test",
  });
  assert.equal(parse(url.toString()).password, "dummy#<");
  assert.equal(url.searchParams.has("sslmode"), false);
  assert.equal(url.searchParams.has("ssl"), false);
  assert.equal(url.searchParams.get("application_name"), "test");
});
test("malformed credentials never appear in errors", () => {
  for (const DATABASE_URL of [
    "postgresql://app:PRIVATE#password@host/shop",
    "https://host/shop",
    "postgresql://app@host/",
  ]) {
    assert.throws(() => databaseConnectionUrl({ DATABASE_URL }), {
      message: "DATABASE_CONNECTION_CONFIG",
    });
  }
  assert.throws(
    () =>
      databaseConnectionUrl({
        DATABASE_URL: "postgresql://app@host/shop",
        DATABASE_PASSWORD_BASE64: "invalid!",
      }),
    { message: "DATABASE_CONNECTION_CONFIG" },
  );
});
