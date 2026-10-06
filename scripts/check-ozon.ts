import {
  OzonTransport,
  activeShipmentMethod,
  OzonAuthError,
} from "../lib/delivery/ozon-transport";
// Production credentials stay within the build process; only safe diagnostics are logged.
async function check() {
  if (!process.env.OZON_CLIENT_ID || !process.env.OZON_CLIENT_SECRET) {
    console.info("Ozon connection check: credentials not configured");
    return;
  }
  try {
    const id = await activeShipmentMethod(
      new OzonTransport(
        process.env.OZON_CLIENT_ID,
        process.env.OZON_CLIENT_SECRET,
      ),
      process.env.OZON_SHIPMENT_METHOD_ID,
    );
    console.info("Ozon connection check: active shipment method ID", id);
  } catch (error) {
    if (error instanceof OzonAuthError)
      console.warn(
        "Ozon connection check: OAuth rejected",
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
