import "server-only";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { databaseConnectionUrl } from "./connection";

const state = globalThis as typeof globalThis & { rootaPool?: Pool };

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
    application_name: "roota-web",
    ssl: local ? false : {
      rejectUnauthorized: true,
      ...(process.env.DATABASE_CA_FILE
        ? { ca: readFileSync(process.env.DATABASE_CA_FILE, "utf8") }
        : process.env.DATABASE_CA_BASE64
          ? { ca: Buffer.from(process.env.DATABASE_CA_BASE64, "base64").toString("utf8") }
          : {}),
    },
  });
  state.rootaPool.on("error", () => console.error("database_idle_connection_error"));
  return state.rootaPool;
}

export async function transaction<T>(work: (client: import("pg").PoolClient) => Promise<T>) {
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
