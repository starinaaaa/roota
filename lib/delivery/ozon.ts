import "server-only";
import { OzonTransport, activeShipmentMethod } from "./ozon-transport";
export function ozonConfigured() {
  return Boolean(process.env.OZON_CLIENT_ID && process.env.OZON_CLIENT_SECRET);
}
let cachedTransport: OzonTransport | undefined;
export function ozonTransport() {
  if (!ozonConfigured())
    throw new Error("Доставка временно недоступна. Свяжитесь со студией.");
  return (cachedTransport ??= new OzonTransport(
    process.env.OZON_CLIENT_ID!,
    process.env.OZON_CLIENT_SECRET!,
  ));
}
export async function shipmentMethodId(): Promise<number> {
  const id = await activeShipmentMethod(
    ozonTransport(),
    process.env.OZON_SHIPMENT_METHOD_ID,
  );
  console.info("Ozon Delivery: active shipment method", id);
  return id;
}
export { postingFor, postingsFor } from "./postings";
import { createOzonAdapter } from "./ozon-adapter";
export const ozon = createOzonAdapter({
  call: (path, body, key) => ozonTransport().call(path, body, key),
});
export type OzonPointInfo = {
  delivery_point_id: number;
  name: string;
  full_address: string;
  coordinates?: { latitude: number; longitude: number };
  is_active: boolean;
  type: string;
  schedule?: {
    date: string;
    periods: { from_local: string; to_local: string }[];
  }[];
};
export async function pointInfo(ids: number[]) {
  const result = await ozonTransport().call<{
    delivery_points: OzonPointInfo[];
  }>("/v1/delivery-point/info", { delivery_point_ids: ids });
  if (!Array.isArray(result.delivery_points))
    throw new Error("Не удалось получить пункты выдачи.");
  return result.delivery_points;
}
