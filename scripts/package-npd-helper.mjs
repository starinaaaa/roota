import {
  readFile,
  mkdir,
  copyFile,
  writeFile,
  mkdtemp,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
const source = path.resolve("extensions/roota-npd"),
  dest = path.resolve("output/market-extension/roota-npd");
await mkdir(dest, { recursive: true });
const files = [
  "manifest.json",
  "config.mjs",
  "core.mjs",
  "controller.mjs",
  "fns-adapter.mjs",
  "worker.mjs",
  "popup.html",
  "popup.mjs",
  "popup.css",
  "README.md",
  "vendor/jsQR.js",
  "vendor/jsQR.LICENSE",
];
const manifest = JSON.parse(await readFile(source + "/manifest.json", "utf8"));
if (
  JSON.stringify(manifest.host_permissions) !==
  JSON.stringify(["https://roota.moscow/*", "https://lknpd.nalog.ru/*"])
)
  throw Error("UNEXPECTED_EXTENSION_HOST_PERMISSIONS");
const configuration = await readFile(source + "/config.mjs", "utf8");
const working = process.argv.includes("--working");
if (
  !(working ? /liveCertified:\s*true/ : /liveCertified:\s*false/).test(
    configuration,
  )
)
  throw Error("RELEASE_MODE_MISMATCH");
await mkdir(path.join(dest, "vendor"), { recursive: true });
for (const file of files)
  await copyFile(path.join(source, file), path.join(dest, file));
const temp = await mkdtemp("/tmp/roota-npd-package-");
execFileSync(
  "/usr/bin/zip",
  ["-q", temp + "/safe.zip", ...files.map((f) => "roota-npd/" + f)],
  { cwd: path.dirname(dest) },
);
await copyFile(
  temp + "/safe.zip",
  path.join(
    path.dirname(dest),
    working ? "roota-npd.zip" : "roota-npd-safe.zip",
  ),
);
const zip = path.join(
  path.dirname(dest),
  working ? "roota-npd.zip" : "roota-npd-safe.zip",
);
await writeFile(
  zip + ".sha256",
  createHash("sha256")
    .update(await readFile(zip))
    .digest("hex") + `  ${working ? "roota-npd.zip" : "roota-npd-safe.zip"}\n`,
);
console.log(zip);
