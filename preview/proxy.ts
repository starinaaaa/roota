import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  if (!["GET", "HEAD"].includes(request.method))
    return new NextResponse("Демонстрационный стенд не принимает данные.", {
      status: 405,
      headers: { Allow: "GET, HEAD", "X-Robots-Tag": "noindex, nofollow" },
    });
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
