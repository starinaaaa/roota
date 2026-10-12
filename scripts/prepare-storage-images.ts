import { createClient } from "@supabase/supabase-js";
import { imageVariantVersion } from "../lib/image-sizes";
import { prepareImageVariants } from "../lib/image-variants";
async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: images, error } = await db
    .from("product_images")
    .select("bucket,storage_path");
  if (error) throw error;
  const { data: page } = await db
    .from("site_pages")
    .select("payload")
    .eq("id", 1)
    .single();
  const hero = page?.payload?.heroImage?.match(/^\/site-media\/([a-f0-9-]+)$/);
  const rows = [
    ...(images ?? []),
    ...(hero
      ? [{ bucket: "product-drafts", storage_path: `site/${hero[1]}.webp` }]
      : []),
  ];
  let prepared = 0,
    skipped = 0;
  const failures: string[] = [];
  for (let start = 0; start < rows.length; start += 3) {
    await Promise.all(
      rows.slice(start, start + 3).map(async (row) => {
        try {
          const storage = db.storage.from(row.bucket);
          const { data: file, error } = await storage.download(
            row.storage_path,
          );
          if (
            error &&
            String(error.statusCode) === "404" &&
            process.argv.includes("--skip-missing")
          ) {
            skipped++;
            return;
          }
          if (error || !file) throw Error("download");
          const variants = await prepareImageVariants(
            Buffer.from(await file.arrayBuffer()),
          );
          for (let i = 0; i < variants.length; i += 3) {
            const results = await Promise.all(
              variants
                .slice(i, i + 3)
                .map((v) =>
                  storage.upload(
                    `${row.storage_path}.v${imageVariantVersion}.w${v.width}.webp`,
                    v.data,
                    { contentType: "image/webp", upsert: true },
                  ),
                ),
            );
            if (results.some((r) => r.error)) throw Error("upload");
          }
          prepared++;
        } catch {
          failures.push(row.storage_path);
        }
      }),
    );
    console.log({
      prepared,
      skipped,
      total: rows.length,
      failed: failures.length,
    });
  }
  if (failures.length) {
    console.error({ failedPaths: failures });
    throw Error(`Failed images: ${failures.length}`);
  }
}
void main();
