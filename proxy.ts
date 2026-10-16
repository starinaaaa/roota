import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  if (
    process.env.APP_ENV === "migration" &&
    process.env.MIGRATION_MAINTENANCE === "true"
  ) {
    // The staging health probe needs HTTP 200 at /. No page, API, cookie or
    // database work runs while the isolated database is being restored.
    return new NextResponse("Проверочная версия временно недоступна.", {
      status:
        request.nextUrl.pathname === "/" && request.method === "GET"
          ? 200
          : 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "60",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
  const response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const privatePath = [
    "/admin",
    "/api/orders",
    "/api/auth",
    "/payment",
    "/api/payments",
    "/order",
    "/api/order",
    "/cart",
    "/checkout",
    "/email",
    "/review",
  ].some((prefix) => path === prefix || path.startsWith(prefix + "/"));
  if (privatePath) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  const publicCatalogue =
    request.method === "GET" &&
    (path === "/api/delivery" ||
      path.startsWith("/media/") ||
      path.startsWith("/site-media/"));
  const paymentReturn = path === "/payment/success" || path === "/payment/fail";
  if (
    !publicCatalogue &&
    !paymentReturn &&
    !request.cookies.get("cart_session")
  )
    response.cookies.set("cart_session", crypto.randomUUID(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
