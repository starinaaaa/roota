import { spawn } from "node:child_process";
const app = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start"],
  { stdio: "inherit", env: process.env },
);
const worker =
  !process.env.ROOTA_REVIEW_HOST && process.env.JOBS_ENABLED === "true"
    ? spawn(process.execPath, ["scripts/worker.mjs"], {
        stdio: "inherit",
        env: process.env,
      })
    : null;
let closing = false;
function stop(signal = "SIGTERM") {
  if (closing) return;
  closing = true;
  app.kill(signal);
  worker?.kill(signal);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => stop(signal));
app.on("exit", (code) => {
  stop();
  process.exitCode = code ?? 1;
});
worker?.on("exit", (code) => {
  if (!closing) {
    console.error("job_worker_stopped");
    stop();
    process.exitCode = code || 1;
  }
});
