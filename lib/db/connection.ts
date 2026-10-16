// Keep credentials out of diagnostic errors. A separate encoded password avoids
// deployment panels interpreting URL escapes or reserved password characters.
export function databaseConnectionUrl(env: Record<string, string | undefined>) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  try {
    const url = new URL(env.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      url.pathname.length < 2 ||
      url.hash
    )
      throw new Error();
    if (env.DATABASE_PASSWORD_BASE64) {
      const encoded = env.DATABASE_PASSWORD_BASE64;
      const password = Buffer.from(encoded, "base64");
      if (
        !password.length ||
        password.toString("base64") !== encoded ||
        password.includes(0)
      )
        throw new Error();
      url.password = encodeURIComponent(password.toString("utf8"));
    }
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl"])
      url.searchParams.delete(key);
    return url;
  } catch {
    throw new Error("DATABASE_CONNECTION_CONFIG");
  }
}
