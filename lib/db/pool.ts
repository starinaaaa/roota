import "server-only";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { databaseConnectionUrl } from "./connection";

const state = globalThis as typeof globalThis & {
  rootaPool?: Pool;
  rootaReviewAuthPool?: Pool;
};

export function getPool() {
  if (state.rootaPool) return state.rootaPool;
  const url = databaseConnectionUrl(process.env);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const max = Number(process.env.DATABASE_POOL_MAX ?? 4);
  if (!Number.isInteger(max) || max < 1 || max > 8)
    throw new Error("DATABASE_POOL_CONFIG");
  state.rootaPool = new Pool({
    connectionString: url.toString(),
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
    application_name: process.env.ROOTA_REVIEW_HOST
      ? "roota-private-review"
      : "roota-web",
    ...(process.env.ROOTA_REVIEW_HOST
      ? { options: "-c default_transaction_read_only=on" }
      : {}),
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ...(process.env.DATABASE_CA_FILE
            ? { ca: readFileSync(process.env.DATABASE_CA_FILE, "utf8") }
            : process.env.DATABASE_CA_BASE64
              ? {
                  ca: Buffer.from(
                    process.env.DATABASE_CA_BASE64,
                    "base64",
                  ).toString("utf8"),
                }
              : {}),
        },
  });
  state.rootaPool.on("error", () =>
    console.error("database_idle_connection_error"),
  );
  return state.rootaPool;
}

export async function transaction<T>(
  work: (client: import("pg").PoolClient) => Promise<T>,
) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Authentication uses only the existing Better Auth tables; shop reads remain read-only.
export function getAuthPool() {
  if (!process.env.ROOTA_REVIEW_HOST) return getPool();
  if (state.rootaReviewAuthPool) return state.rootaReviewAuthPool;
  const config = {
    ...getPool().options,
    max: 1,
    options: "-c default_transaction_read_only=off",
    application_name: "roota-private-review-auth",
  };
  state.rootaReviewAuthPool = new Pool(config);
  state.rootaReviewAuthPool.on("error", () =>
    console.error("review_auth_connection_error"),
  );
  return state.rootaReviewAuthPool;
}
