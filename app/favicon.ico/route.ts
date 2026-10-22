import { getSiteContent } from "@/lib/site";
export async function GET() {
  const site = await getSiteContent();
  const path = site.browserIcon
    ? `${site.browserIcon}?format=png`
    : "/brand/favicon.ico";
  return new Response(null, {
    status: 307,
    headers: { Location: path, "Cache-Control": "public, max-age=300" },
  });
}
