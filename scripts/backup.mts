import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const target = process.argv[2];
if (!target || !path.isAbsolute(target))
  throw new Error("Pass an absolute directory outside the repository");
if (
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL
)
  throw new Error("Load environment locally; never paste keys into chat");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
await mkdir(target, { recursive: true, mode: 0o700 });
const tables = [
  "categories",
  "products",
  "product_images",
  "customers",
  "carts",
  "cart_items",
  "orders",
  "order_items",
  "waitlist",
  "preorders",
];
const manifest: {
  tables: Record<string, number>;
  files: { bucket: string; path: string; sha256: string }[];
  createdAt: string;
} = { tables: {}, files: [], createdAt: new Date().toISOString() };
for (const table of tables) {
  const records: unknown[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(`Backup failed for ${table}: ${error.code}`);
    records.push(...data);
    if (data.length < 1000) break;
  }
  await writeFile(
    path.join(target, table + ".json"),
    JSON.stringify(records, null, 2),
    { mode: 0o600 },
  );
  manifest.tables[table] = records.length;
}
const { data: buckets, error: bucketsError } = await db.storage.listBuckets();
if (bucketsError) throw new Error("Cannot list storage buckets");
await writeFile(
  path.join(target, "storage-buckets.json"),
  JSON.stringify(buckets, null, 2),
  { mode: 0o600 },
);
for (const bucket of buckets ?? []) {
  const walk = async (prefix = "") => {
    let offset = 0;
    while (true) {
      const { data, error } = await db.storage
        .from(bucket.id)
        .list(prefix, {
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
      if (error) throw new Error("Cannot list storage");
      for (const item of data ?? []) {
        const objectPath = [prefix, item.name].filter(Boolean).join("/");
        if (!item.id) {
          await walk(objectPath);
          continue;
        }
        const { data: file, error: fileError } = await db.storage
          .from(bucket.id)
          .download(objectPath);
        if (fileError || !file)
          throw new Error("Cannot download storage object");
        const bytes = Buffer.from(await file.arrayBuffer());
        const destination = path.resolve(
          target,
          "storage",
          bucket.id,
          objectPath,
        );
        if (!destination.startsWith(path.resolve(target, "storage") + path.sep))
          throw new Error("Invalid object path");
        await mkdir(path.dirname(destination), {
          recursive: true,
          mode: 0o700,
        });
        await writeFile(destination, bytes, { mode: 0o600 });
        manifest.files.push({
          bucket: bucket.id,
          path: objectPath,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
      if ((data?.length ?? 0) < 1000) break;
      offset += 1000;
    }
  };
  await walk();
}
await writeFile(
  path.join(target, "manifest.json"),
  JSON.stringify(manifest, null, 2),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    backupDirectory: target,
    counts: manifest.tables,
    files: manifest.files.length,
  }),
);
