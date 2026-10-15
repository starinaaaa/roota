import { getAuth } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const response = await getAuth().handler(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export { handle as GET, handle as POST };
