import { displayState, newDisplay } from "@/lib/market/server";
import { json, marketError, readMarketBody } from "@/lib/market/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json(await displayState());
  } catch (e) {
    return marketError(e);
  }
}
export async function POST(request: Request) {
  try {
    await readMarketBody(request);
    return json(await newDisplay());
  } catch (e) {
    return marketError(e);
  }
}
