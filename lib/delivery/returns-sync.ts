import "server-only";
import { getPool } from "@/lib/db/pool";
import { ozonTransport, shipmentMethodId } from "./ozon";
import { syncCarrierReturns } from "./returns-sync-core";
export async function syncOzonReturns() {
  return syncCarrierReturns(
    getPool(),
    ozonTransport(),
    await shipmentMethodId(),
  );
}
