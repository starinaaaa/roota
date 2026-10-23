import { browserIconUrl } from "@/lib/browser-icon";
import { getSiteContent } from "@/lib/site";
export async function GET() {
  const site = await getSiteContent();
  const path = site.browserIcon
    ? browserIconUrl(site.browserIcon, 32)
    : "/brand/favicon.ico";
  return new Response(null, {
    status: 307,
    headers: { Location: path, "Cache-Control": "public, max-age=300" },
  });
}
