import registry from "../../database/registry.json";
import type { Pool } from "pg";
import rawJsonColumns from "../../database/json-columns.json";
import rawJsonArgs from "../../database/function-json-args.json";
const jsonColumns: Record<string, string[]> = rawJsonColumns;
const jsonArgs: Record<string, string[]> = rawJsonArgs;

// Small server-only compatibility layer for the existing repository queries.
// SQL identifiers are registry checked; all data values use bind parameters.
// Supabase's client is used only as a compile-time interface by index.ts.
const tables: Record<string, string[]> = { ...registry.tables, ...registry.views };
export const identifier = (value: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("INVALID_IDENTIFIER");
  return `"${value}"`;
};
function tableName(name: string) {
  if (!Object.hasOwn(tables, name)) throw new Error("UNKNOWN_TABLE");
  return `public.${identifier(name)}`;
}
function column(table: string, name: string) {
  if (tables[table]?.length && !tables[table].includes(name)) throw new Error("UNKNOWN_COLUMN");
  return identifier(name);
}

type Filter = { field: string; op: string; value: unknown };
type Options = { count?: string; head?: boolean };
type Upsert = { onConflict?: string; ignoreDuplicates?: boolean };
type Relation = { table: string; local: string; foreign: string; many: boolean };
const relations: Record<string, Record<string, Relation>> = {
  products: {
    categories: { table: "categories", local: "category_id", foreign: "id", many: false },
    product_images: { table: "product_images", local: "id", foreign: "product_id", many: true },
  },
  product_redirects: { products: { table: "products", local: "product_id", foreign: "id", many: false } },
  carts: { cart_items: { table: "cart_items", local: "id", foreign: "cart_id", many: true } },
  orders: Object.fromEntries([
    ["customers", "customer_id", "id", false],
    ...["order_items", "order_events", "notification_outbox", "order_shipments", "order_returns", "payments"].map(t => [t, "id", "order_id", true]),
  ].map(([table, local, foreign, many]) => [table, { table, local, foreign, many }])) as Record<string, Relation>,
  customer_reviews: { orders: { table: "orders", local: "order_id", foreign: "id", many: false } },
  email_messages: { orders: { table: "orders", local: "order_id", foreign: "id", many: false } },
  waitlist: { products: { table: "products", local: "product_id", foreign: "id", many: false } },
};

function fragments(selection: string) {
  let level = 0, start = 0;
  const result: string[] = [];
  for (let i = 0; i < selection.length; i++) {
    if (selection[i] === "(") level++;
    if (selection[i] === ")") level--;
    if (level < 0) throw new Error("INVALID_SELECTION");
    if (selection[i] === "," && level === 0) { result.push(selection.slice(start, i).trim()); start = i + 1; }
  }
  if (level !== 0) throw new Error("INVALID_SELECTION");
  result.push(selection.slice(start).trim());
  return result;
}

export class Query implements PromiseLike<unknown> {
  private selection = "*";
  private options: Options = {};
  private filters: Filter[] = [];
  private disjunctions: Filter[][] = [];
  private sorts: { field: string; asc: boolean }[] = [];
  private take?: number;
  private offset = 0;
  private cardinality: "many" | "one" | "optional" = "many";
  private operation = "select";
  private payload: Record<string, unknown>[] = [];
  private conflict?: Upsert;
  private signal?: AbortSignal;
  private execution?: Promise<unknown>;
  constructor(private pool: Pick<Pool, "query" | "connect">, private table?: string, private fn?: string, private args: Record<string, unknown> = {}) {
    if (table) tableName(table);
    if (fn && !registry.functions.includes(fn)) throw new Error("UNKNOWN_FUNCTION");
  }
  select(value = "*", options: Options = {}) { this.selection = value; this.options = options; return this; }
  eq(field: string, value: unknown) { this.filters.push({field, op: "=", value}); return this; }
  neq(field: string, value: unknown) { this.filters.push({field, op: "<>", value}); return this; }
  gt(field: string, value: unknown) { this.filters.push({field, op: ">", value}); return this; }
  gte(field: string, value: unknown) { this.filters.push({field, op: ">=", value}); return this; }
  lt(field: string, value: unknown) { this.filters.push({field, op: "<", value}); return this; }
  lte(field: string, value: unknown) { this.filters.push({field, op: "<=", value}); return this; }
  ilike(field: string, value: unknown) { this.filters.push({field, op: "ILIKE", value}); return this; }
  like(field: string, value: unknown) { this.filters.push({field, op: "LIKE", value}); return this; }
  is(field: string, value: unknown) { this.filters.push({field, op: "IS", value}); return this; }
  not(field: string, op: string, value: unknown) {
    if (op !== "is" || value !== null) throw new Error("UNSUPPORTED_FILTER");
    this.filters.push({field, op: "IS NOT", value}); return this;
  }
  in(field: string, value: unknown[]) { this.filters.push({field, op: "IN", value}); return this; }
  or(value: string) {
    this.disjunctions.push(value.split(",").map(part => {
      const m = /^([a-z_]+)\.(ilike|not\.is)\.([\s\S]*)$/.exec(part);
      if (!m || (m[2] === "not.is" && m[3] !== "null")) throw new Error("UNSUPPORTED_OR");
      return { field: m[1], op: m[2] === "ilike" ? "ILIKE" : "IS NOT", value: m[2] === "ilike" ? m[3] : null };
    })); return this;
  }
  order(field: string, options?: { ascending?: boolean }) { this.sorts.push({field, asc: options?.ascending !== false}); return this; }
  limit(n: number) { if (!Number.isSafeInteger(n) || n < 0 || n > 100000) throw new Error("INVALID_LIMIT"); this.take = n; return this; }
  range(from: number, to: number) { this.limit(to - from + 1); if (!Number.isSafeInteger(from) || from < 0) throw new Error("INVALID_OFFSET"); this.offset = from; return this; }
  single() { this.cardinality = "one"; return this; }
  maybeSingle() { this.cardinality = "optional"; return this; }
  abortSignal(signal: AbortSignal) { this.signal = signal; return this; }
  insert(payload: Record<string, unknown> | Record<string, unknown>[]) { this.operation = "insert"; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
  update(payload: Record<string, unknown>) { this.operation = "update"; this.payload = [payload]; return this; }
  upsert(payload: Record<string, unknown> | Record<string, unknown>[], options: Upsert = {}) { this.insert(payload); this.conflict = options; return this; }
  delete() { this.operation = "delete"; return this; }

  async execute() {
    const values: unknown[] = [];
    const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
    const compileFilter = (filter: Filter, table: string, alias: string) => {
      const field = `${alias}.${column(table, filter.field)}`;
      if (filter.op === "IS" || filter.op === "IS NOT") {
        if (filter.value !== null && typeof filter.value !== "boolean") throw new Error("INVALID_IS");
        return `${field} ${filter.op} ${filter.value === null ? "NULL" : filter.value ? "TRUE" : "FALSE"}`;
      }
      if (filter.op === "IN") {
        const list = filter.value as unknown[];
        return list.length ? `${field} IN (${list.map(bind).join(",")})` : "FALSE";
      }
      return `${field} ${filter.op} ${bind(filter.value)}`;
    };
    const projection = (table: string, selection: string, alias: string): string => {
      let result = "'{}'::jsonb";
      for (const fragment of fragments(selection)) {
        if (fragment === "*") { result += ` || to_jsonb(${alias})`; continue; }
        const relation = /^(?:(\w+):)?(\w+)\s*\(([\s\S]*)\)$/.exec(fragment);
        if (!relation) { result += ` || jsonb_build_object('${column(table, fragment).slice(1, -1)}',${alias}.${column(table, fragment)})`; continue; }
        const [, label, target, inner] = relation;
        const rel = relations[table]?.[target];
        if (!rel) throw new Error("UNKNOWN_RELATION");
        const child = `${alias}_${target}`;
        const nested = projection(target, inner, child);
        const relatedFilters = this.filters.filter(f => f.field.startsWith((label || target) + ".")).map(f => compileFilter({...f, field: f.field.slice(f.field.indexOf(".") + 1)}, target, child));
        const subquery = `SELECT ${nested} AS data FROM ${tableName(target)} ${child} WHERE ${child}.${column(target, rel.foreign)}=${alias}.${column(table, rel.local)}${relatedFilters.length ? " AND " + relatedFilters.join(" AND ") : ""}`;
        const expression = rel.many ? `(SELECT coalesce(jsonb_agg(r.data),'[]'::jsonb) FROM (${subquery}) r)` : `(${subquery})`;
        result += ` || jsonb_build_object('${identifier(label || target).slice(1, -1)}',${expression})`;
      }
      return `(${result})`;
    };
    try {
      this.signal?.throwIfAborted();
      let sql: string;
      if (this.fn) {
        sql = `SELECT to_jsonb(public.${identifier(this.fn)}(${Object.entries(this.args).map(([key,value]) => `${identifier(key)} => ${bind(jsonArgs[this.fn!]?.includes(key) && value !== null ? JSON.stringify(value) : value)}`).join(",")})) AS data`;
      } else {
        const table = this.table!;
        const predicates = this.filters.filter(f => !f.field.includes(".")).map(f => compileFilter(f, table, "t"));
        for (const group of this.disjunctions) predicates.push(`(${group.map(f=>compileFilter(f,table,"t")).join(" OR ")})`);
        const where = predicates.length ? " WHERE " + predicates.join(" AND ") : "";
        const select = projection(table, this.selection, "t");
        if (this.operation === "select") {
          const sorts = this.sorts.length ? " ORDER BY " + this.sorts.map(s => `t.${column(table,s.field)} ${s.asc ? "ASC" : "DESC"}`).join(",") : "";
          sql = `WITH matching AS (SELECT t.* FROM ${tableName(table)} t${where}), page AS (SELECT ${select} data FROM matching t${sorts}${this.take !== undefined ? ` LIMIT ${this.take}` : ""} OFFSET ${this.offset}) SELECT coalesce(jsonb_agg(page.data),'[]'::jsonb) data${this.options.count ? ", (SELECT count(*)::int FROM matching) count" : ""} FROM page`;
        } else if (this.operation === "insert") {
          if (!this.payload.length) return { data: [], error: null, count: null };
          const columns = Object.keys(this.payload[0]);
          if (this.payload.some(row => Object.keys(row).length !== columns.length || columns.some(c => !Object.hasOwn(row,c)))) throw new Error("MIXED_INSERT_COLUMNS");
          let conflict = "";
          if (this.conflict) {
            const keys = (this.conflict.onConflict || ({site_drafts:"id",delivery_sync:"provider",delivery_points:"provider,id"} as Record<string,string>)[table] || "id").split(",");
            conflict = ` ON CONFLICT (${keys.map(c=>column(table,c)).join(",")}) DO ` + (this.conflict.ignoreDuplicates ? "NOTHING" : `UPDATE SET ${columns.filter(c=>!keys.includes(c)).map(c=>`${column(table,c)}=EXCLUDED.${column(table,c)}`).join(",")}`);
          }
          // pg sends JS arrays as PG arrays. JSON values must be serialized explicitly.
          const encode = (name: string, value: unknown) => jsonColumns[table]?.includes(name) && value !== null ? JSON.stringify(value) : value;
          sql = `WITH changed AS (INSERT INTO ${tableName(table)} (${columns.map(c=>column(table,c)).join(",")}) VALUES ${this.payload.map(row=>`(${columns.map(c=>bind(encode(c,row[c]))).join(",")})`).join(",")}${conflict} RETURNING *) SELECT ${select} data FROM changed t`;
        } else {
          if (!predicates.length) throw new Error("UNBOUNDED_MUTATION");
          const assignments = this.operation === "update" ? " SET " + Object.entries(this.payload[0]).map(([c,v])=>`${column(table,c)}=${bind(jsonColumns[table]?.includes(c) && v !== null ? JSON.stringify(v) : v)}`).join(",") : "";
          sql = `WITH changed AS (${this.operation === "update" ? "UPDATE" : "DELETE FROM"} ${tableName(table)} t${assignments}${where} RETURNING t.*) SELECT ${select} data FROM changed t`;
        }
      }
      const result = await this.run(sql, values);
      this.signal?.throwIfAborted();
      let data = this.fn ? (["claim_email_messages","claim_order_shipment_sync"].includes(this.fn) ? result.rows.map(row=>row.data) : result.rows[0]?.data) : this.operation === "select" ? result.rows[0]?.data ?? [] : result.rows.map(row=>row.data);
      if (!this.fn && this.cardinality !== "many") {
        if (data.length > 1 || (this.cardinality === "one" && data.length !== 1)) throw new Error("ROW_CARDINALITY");
        data = data[0] ?? null;
      }
      return { data: this.options.head ? null : data, error: null, count: result.rows[0]?.count ?? null };
    } catch (error) {
      // Keep SQL/detail/connection strings and buyer data out of logs and responses.
      const message = error instanceof Error && /^[A-Z][A-Z_]{2,80}$/.test(error.message) ? error.message : "DATABASE_QUERY_FAILED";
      return { data: null, error: { message, code: typeof (error as {code?:unknown})?.code === "string" && /^[A-Z0-9]{5}$/.test((error as {code:string}).code) ? (error as {code:string}).code : "DATABASE_ERROR" }, count: null };
    }
  }
  private async run(text: string, values: unknown[]) {
    if (!this.signal) return this.pool.query(text, values);
    const signal = this.signal;
    signal.throwIfAborted();
    let abandoned = false;
    const waiting = this.pool.connect();
    const abort = new Promise<never>((_, reject) => {
      const onAbort = () => { abandoned = true; reject(new Error("DATABASE_DEADLINE")); };
      signal.addEventListener("abort", onAbort, { once: true });
      waiting.finally(() => signal.removeEventListener("abort", onAbort)).catch(() => {});
    });
    waiting.then(client => { if (abandoned) client.release(); }, () => {});
    const client = await Promise.race([waiting, abort]);
    let released = false;
    const cancel = () => { if (!released) { released = true; client.release(true); } };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      signal.throwIfAborted();
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='1500ms'");
      const result = await client.query(text, values);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (!released) await client.query("ROLLBACK");
      throw error;
    } finally {
      signal.removeEventListener("abort", cancel);
      if (!released) { released = true; client.release(); }
    }
  }
  then<T = unknown, U = never>(yes?: ((value: unknown) => T | PromiseLike<T>) | null, no?: ((reason: unknown) => U | PromiseLike<U>) | null): Promise<T | U> {
    return (this.execution ??= this.execute()).then(yes, no);
  }
}

