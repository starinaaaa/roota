import { siteUrl } from "@/lib/seo";

// Only navigate the buyer. The signed ResultURL handler records payment.
export async function POST(request: Request) {
  const failed = new URL(request.url).searchParams.get("failed") === "1";
  const url = new URL(siteUrl(failed ? "/payment/fail" : "/payment/success"));
  const form = await request.formData().catch(() => null);
  for (const name of ["Shp_payment", "Shp_source"]) {
    const value = form?.get(name);
    if (typeof value === "string" && value.length <= 64) url.searchParams.set(name, value);
  }
  return Response.redirect(url, 303);
}
