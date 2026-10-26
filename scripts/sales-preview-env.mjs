export function previewEnvironment(source) {
  const allowed = [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "NODE_ENV",
    "PORT",
    "HOSTNAME",
    "LANG",
    "LC_ALL",
    "TZ",
    "CI",
  ];
  const env = Object.fromEntries(
    allowed.filter((k) => source[k]).map((k) => [k, source[k]]),
  );
  return { ...env, NEXT_TELEMETRY_DISABLED: "1" };
}
