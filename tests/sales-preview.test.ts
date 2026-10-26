import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { previewEnvironment } from "../scripts/sales-preview-env.mjs";
import {
  gardenPrice,
  defaultGarden,
  changeGardenPart,
  gardenConfigurationSchema,
} from "../preview/lib/garden";
test("preview strips inherited production credentials and worker settings", () => {
  const env = previewEnvironment({
    DATABASE_URL: "private",
    S3_SECRET_ACCESS_KEY: "private",
    ROBOKASSA_PASSWORD1: "private",
    JOBS_ENABLED: "true",
    NEXT_PUBLIC_SITE_URL: "https://roota.moscow",
    PORT: "3000",
    PATH: "/usr/bin",
  });
  assert.deepEqual(env, {
    PORT: "3000",
    PATH: "/usr/bin",
    NEXT_TELEMETRY_DISABLED: "1",
  });
});
test("preview uses the exact published garden pricing and supports presets, extras, replacements and pieces", () => {
  assert.equal(
    readFileSync("preview/lib/garden.ts", "utf8"),
    readFileSync("lib/garden.ts", "utf8"),
  );
  assert.deepEqual(
    [8, 12, 16, 24].map(
      (n) => gardenPrice(defaultGarden(n as 8 | 12 | 16 | 24)).total,
    ),
    [2600, 3900, 4940, 7020],
  );
  for (const n of [1, 15, 16, 23, 24, 100]) {
    const c = { size: 8 as const, stems: n, flowers: 0, leaves: 0 };
    assert.equal(gardenPrice(c).discount, n >= 24 ? 10 : n >= 16 ? 5 : 0);
    assert.equal(gardenPrice({ ...c, size: 0 }).discount, 0);
  }
  const swapped = changeGardenPart(
    changeGardenPart(defaultGarden(8), "stems", 3),
    "leaves",
    3,
  );
  assert.equal(gardenPrice(swapped).total, 2500);
  assert.equal(
    gardenPrice(changeGardenPart(defaultGarden(8), "flowers", 3)).total,
    2950,
  );
  assert.equal(
    gardenPrice({ ...defaultGarden(0), stems: 0, leaves: 1 }).total,
    250,
  );
  assert.equal(
    gardenConfigurationSchema.safeParse({
      size: 0,
      stems: 0,
      flowers: 0,
      leaves: 0,
    }).success,
    false,
  );
});
test("preview has no production backend imports and excludes indexing", () => {
  const files = [
    "preview/app/[[...path]]/page.tsx",
    ...readdirSync("preview/components").map((f) => "preview/components/" + f),
  ];
  for (const file of files)
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /fetch\(|use server|@\/lib\/actions|@\/lib\/db/,
    );
  assert.match(
    readFileSync("preview/app/robots.ts", "utf8"),
    /disallow:\s*["']\/["']/,
  );
  assert.match(readFileSync("preview/proxy.ts", "utf8"), /status:\s*405/);
  const catalog = JSON.parse(
    readFileSync("preview/lib/catalog-source.json", "utf8"),
  );
  assert.equal(catalog.length, 4);
  for (const p of catalog) {
    assert.equal("stock_qty" in p, false);
    assert.equal(
      p.images.every((image: string) => image.startsWith("/products/")),
      true,
    );
  }
});
