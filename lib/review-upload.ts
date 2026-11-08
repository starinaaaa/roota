import { hiddenShopPath } from "./shop-features";
import { isTrustedRequestOrigin } from "./request-origin";

// Upload routes skip Proxy's body clone (10 MB), but keep its access restrictions here.
export function reviewUploadRejection(request: Request): Response | null {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
  };
  if (hiddenShopPath(new URL(request.url).pathname))
    return Response.json(
      { error: "Страница не найдена" },
      { status: 404, headers },
    );
  if (process.env.ROOTA_REVIEW_HOST)
    return Response.json(
      { error: "Стенд доступен только для просмотра" },
      { status: 405, headers },
    );
  if (
    process.env.APP_ENV === "migration" &&
    process.env.MIGRATION_MAINTENANCE === "true"
  )
    return Response.json(
      { error: "Проверочная версия временно недоступна" },
      { status: 503, headers },
    );
  if (!isTrustedRequestOrigin(request))
    return Response.json(
      { error: "Недопустимый запрос" },
      { status: 400, headers },
    );
  return null;
}
