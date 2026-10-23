// Preview by default; --apply replaces all parcels only after verified cancellation.
import { pool } from "./migration/common";
import { OzonTransport } from "../lib/delivery/ozon-transport";
import { recreatePaidShipment } from "../lib/delivery/recreate-shipment";
const orderId = process.argv[2],
  expectedPosting = process.argv[3];
if (!/^[0-9a-f-]{36}$/i.test(orderId ?? "") || !expectedPosting)
  throw new Error(
    "Usage: repack-paid-order.mts ORDER_UUID OLD_PRIMARY_POSTING [--apply]",
  );
const db = pool("TARGET_DATABASE_URL");
try {
  console.log(
    JSON.stringify(
      await recreatePaidShipment({
        db,
        transport: new OzonTransport(
          process.env.OZON_CLIENT_ID!,
          process.env.OZON_CLIENT_SECRET!,
        ),
        orderId,
        expectedPosting,
        apply: process.argv.includes("--apply"),
        allowActive: true,
      }),
    ),
  );
} finally {
  await db.end();
}
