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
