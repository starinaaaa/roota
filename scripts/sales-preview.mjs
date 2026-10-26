// Dedicated entrypoint: the preview never builds or starts the production app.
// Only platform/runtime variables survive; no database, payment or messaging credentials.
import { spawn } from "node:child_process";
import { previewEnvironment } from "./sales-preview-env.mjs";
const env = previewEnvironment(process.env);
const action = process.argv[2];
if (!["build", "start", "dev"].includes(action))
  throw new Error("PREVIEW_ACTION");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    action,
    "preview",
    ...(action === "dev"
      ? ["--webpack", "--port", "3200"]
      : action === "build"
        ? ["--webpack"]
        : []),
  ],
  { stdio: "inherit", env },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
