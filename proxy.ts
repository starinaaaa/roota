import {
  reviewCookie,
  reviewAccessToken,
  validReviewToken,
  reviewAllowsRequest,
} from "@/lib/review-access";
import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const reviewHost = process.env.ROOTA_REVIEW_HOST;
  if (reviewHost) {
    const secret = process.env.BETTER_AUTH_SECRET;
    const headers = {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    };
    const supplied =
      request.nextUrl.searchParams.get("review_access") ?? undefined;
    if (validReviewToken(supplied, secret, reviewHost)) {
      const url = new URL(request.nextUrl.pathname, `https://${reviewHost}`);
      const response = NextResponse.redirect(url);
      response.cookies.set(
        reviewCookie,
        reviewAccessToken(secret!, reviewHost),
        {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 86400,
        },
      );
      for (const [key, value] of Object.entries(headers))
        response.headers.set(key, value);
      return response;
    }
    if (
      !validReviewToken(
        request.cookies.get(reviewCookie)?.value,
        secret,
        reviewHost,
      )
    ) {
      return new NextResponse(
        "Закрытый стенд Roota. Для просмотра откройте персональную ссылку.",
        { status: request.nextUrl.pathname === "/" ? 200 : 401, headers },
      );
    }
    if (!reviewAllowsRequest(request.method, request.nextUrl.pathname))
      return new NextResponse(
        "Стенд доступен только для просмотра. Оплата, отправки и изменение магазина здесь не выполняются.",
        { status: 405, headers },
      );
  }
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
  const path = request.nextUrl.pathname;
  const wheel = path === "/wheel" || path.startsWith("/wheel/");
  const requestHeaders = new Headers(request.headers);
  // Always overwrite this internal signal; a public request cannot spoof it.
  requestHeaders.set("x-roota-surface", wheel ? "wheel" : "store");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (reviewHost) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  if (wheel) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
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
    "/draft",
    "/selection",
    "/favorites",
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
