import { createClient } from "@supabase/supabase-js";
import { syncCatalogPage } from "../lib/delivery/catalog-sync";
import {
  OzonTransport,
  activeShipmentMethod,
  OzonAuthError,
  OzonApiError,
  OzonConnectionError,
} from "../lib/delivery/ozon-transport";
// Production credentials stay within the build process; only safe diagnostics are logged.
async function check(attempt = 0) {
  if (!process.env.OZON_CLIENT_ID || !process.env.OZON_CLIENT_SECRET) {
    console.info("Ozon connection check: credentials not configured");
    return;
  }
  try {
    const transport = new OzonTransport(
      process.env.OZON_CLIENT_ID,
      process.env.OZON_CLIENT_SECRET,
    );
    const id = await activeShipmentMethod(
      transport,
      process.env.OZON_SHIPMENT_METHOD_ID,
    );
    console.info("Ozon connection check: active shipment method ID", id);
    if (
      process.env.VERCEL_ENV === "production" &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL
    ) {
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } },
      );
      const { count, error } = await db
        .from("delivery_points")
        .select("id", { count: "exact", head: true })
        .eq("provider", "ozon");
      const { data: state } = await db
        .from("delivery_sync")
        .select("cursor")
        .eq("provider", "ozon")
        .maybeSingle();
      if (error) throw new Error("Catalogue storage unavailable");
      if (!count || state?.cursor) {
        const started = Date.now();
        let total = 0;
        for (let page = 0; page < 2000; page++) {
          const result = await syncCatalogPage(db, transport, id);
          total += result.count;
          if (page % 25 === 0 || !result.more)
            console.info("Ozon catalogue: imported", total, "points");
          if (!result.more) break;
          if (Date.now() - started > 300000) {
            console.info(
              "Ozon catalogue: paused; resume in admin delivery settings",
            );
            break;
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof OzonConnectionError && attempt < 2) {
      console.warn(
        "Ozon connection check: retry",
        attempt + 1,
        error.endpoint,
        error.code,
      );
      return check(attempt + 1);
    }
    if (error instanceof OzonConnectionError)
      console.warn(
        "Ozon connection check: network failure",
        error.endpoint,
        error.code,
      );
    else if (error instanceof OzonAuthError)
      console.warn(
        "Ozon connection check: OAuth rejected",
        error.status,
        error.reason,
      );
    else if (error instanceof OzonApiError)
      console.warn(
        "Ozon connection check: API rejected",
        error.path,
        error.status,
        error.reason,
      );
    else
      console.warn(
        "Ozon connection check:",
        error instanceof Error ? error.message : "unavailable",
      );
  }
}
void check();
